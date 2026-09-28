
import { v } from "convex/values";
import { mutation, query, internalQuery, QueryCtx, MutationCtx } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import { requireOrgAdmin, requireUser, resolveOrgId, getUserSafe, isSuperAdmin, normalizeOrgId } from "./auth";
import {
    requireWriteAccess,
    getAdministeredUnitIds,
    resolveManagedMemberIds,
    memberIdInScope,
    callerOrgId,
    describeCallerScope,
    getLinkedMember,
    isOrgWideScope,
} from "./scope";
import { assertMemberLimit } from "./entitlements";
import { internal } from "./_generated/api";
import { emitEventSafe } from "./automation/events";

// Re-export so existing imports of resolveManagedMemberIds from members keep working.
export { resolveManagedMemberIds } from "./scope";

/**
 * Resolve the member linked to a Clerk user id, for server-side code that
 * only has an identity (e.g. the giving-checkout action) and needs to trust
 * the *server's* view of "who this is" rather than a client-supplied id.
 */
export const getLinkedMemberInternal = internalQuery({
    args: { clerk_user_id: v.string() },
    handler: async (ctx, args) => {
        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_user_id", args.clerk_user_id))
            .unique();
        if (!user) return null;
        const member = await getLinkedMember(ctx, user);
        if (!member) return null;
        return { _id: member._id, name: member.name, email: member.email };
    },
});

type Ctx = QueryCtx | MutationCtx;

// Helper to format member with details (typed)
async function formatMember(ctx: Ctx, member: Doc<"members">) {
    // Get member units (including ministries which are units with type "ministry")
    const memberUnits = await ctx.db
        .query("member_units")
        .withIndex("by_member", (q) => q.eq("member_id", member._id))
        .collect();

    const unitNames: string[] = [];
    const unitIds: Id<"units">[] = [];

    await Promise.all(memberUnits.map(async (mu: Doc<"member_units">) => {
        const unit = await ctx.db.get(mu.unit_id);
        if (unit) {
            unitNames.push(unit.name);
            unitIds.push(unit._id);
        }
    }));

    let avatarUrl = member.avatar_url;
    if (avatarUrl && !avatarUrl.startsWith("http")) {
        // Assume it's a storage ID
        avatarUrl = await ctx.storage.getUrl(avatarUrl) ?? undefined;
    }

    return {
        ...member,
        id: member._id, // Map _id to id for frontend compatibility
        avatar_url: avatarUrl,
        unit_names: unitNames,
        units: unitNames, // Consistency
        unit_ids: unitIds, // Re-mapped
    };
}

/**
 * How many of a member's most recently recorded check-ins are read to find
 * their last attendance. The latest-dated service is almost always among the
 * last few recorded; reading every row a long-standing member has would make
 * a 400-row directory page read tens of thousands of documents.
 */
const LAST_ATTENDANCE_LOOKBACK = 5;

/** Per-request caches so a page reads each label and service once. */
type DirectoryCaches = {
    labels: Map<Id<"labels">, Promise<Doc<"labels"> | null>>;
    attendance: Map<Id<"attendance">, Promise<Doc<"attendance"> | null>>;
    lastAttendance: Map<Id<"members">, Promise<string | null>>;
};

function newDirectoryCaches(): DirectoryCaches {
    return { labels: new Map(), attendance: new Map(), lastAttendance: new Map() };
}

function cachedGet<T extends "labels" | "attendance">(
    ctx: Ctx,
    cache: Map<Id<T>, Promise<Doc<T> | null>>,
    id: Id<T>,
): Promise<Doc<T> | null> {
    let pending = cache.get(id);
    if (!pending) {
        pending = ctx.db.get(id) as Promise<Doc<T> | null>;
        cache.set(id, pending);
    }
    return pending;
}

/** The date ("yyyy-mm-dd") of the member's latest recorded attendance, or null. */
function lastAttendanceDate(ctx: Ctx, memberId: Id<"members">, caches: DirectoryCaches): Promise<string | null> {
    let pending = caches.lastAttendance.get(memberId);
    if (!pending) {
        pending = (async () => {
            const rows = await ctx.db
                .query("member_attendance")
                .withIndex("by_member", (q) => q.eq("member_id", memberId))
                .order("desc")
                .take(LAST_ATTENDANCE_LOOKBACK);
            const records = await Promise.all(
                rows.map((r) => cachedGet(ctx, caches.attendance, r.attendance_id)),
            );
            let latest: string | null = null;
            for (const record of records) {
                if (record && (!latest || record.date > latest)) latest = record.date;
            }
            return latest;
        })();
        caches.lastAttendance.set(memberId, pending);
    }
    return pending;
}

/** Labels and last attendance for the directory's Labels and Last attendance columns. */
async function directoryDetails(ctx: Ctx, member: Doc<"members">, caches: DirectoryCaches) {
    const [labelRows, last_attendance] = await Promise.all([
        ctx.db
            .query("member_labels")
            .withIndex("by_member", (q) => q.eq("member_id", member._id))
            .collect(),
        lastAttendanceDate(ctx, member._id, caches),
    ]);
    const labels = (
        await Promise.all(labelRows.map((r) => cachedGet(ctx, caches.labels, r.label_id)))
    ).filter((l): l is Doc<"labels"> => l !== null);
    labels.sort((a, b) => a.name.localeCompare(b.name));
    return { labels, last_attendance: last_attendance ?? undefined };
}

type SortColumn = "name" | "status" | "joined_date" | "last_attendance" | "score";

/**
 * Sort the whole filtered set (not just a loaded page) by a directory column.
 * Members with no value for the column always go last, whichever way the
 * column is sorted; ties fall back to name.
 */
async function sortMembers(
    ctx: Ctx,
    members: Doc<"members">[],
    column: SortColumn,
    direction: "asc" | "desc",
    caches: DirectoryCaches,
): Promise<Doc<"members">[]> {
    if (column === "name") {
        return direction === "desc" ? [...members].reverse() : members;
    }
    let keyOf: (m: Doc<"members">) => string | number | undefined;
    if (column === "last_attendance") {
        const dates = await Promise.all(members.map((m) => lastAttendanceDate(ctx, m._id, caches)));
        const byId = new Map(members.map((m, i) => [m._id, dates[i] ?? undefined]));
        keyOf = (m) => byId.get(m._id);
    } else if (column === "status") {
        keyOf = (m) => m.status || undefined;
    } else if (column === "joined_date") {
        keyOf = (m) => m.joined_date || undefined;
    } else {
        keyOf = (m) => m.engagement_score ?? undefined;
    }
    const sign = direction === "asc" ? 1 : -1;
    return [...members].sort((a, b) => {
        const ka = keyOf(a);
        const kb = keyOf(b);
        if (ka === undefined && kb === undefined) return a.name.localeCompare(b.name);
        if (ka === undefined) return 1;
        if (kb === undefined) return -1;
        if (ka < kb) return -sign;
        if (ka > kb) return sign;
        return a.name.localeCompare(b.name);
    });
}

function matchesArchiveFilter(
    m: Doc<"members">,
    mode: "active" | "archived" | "all",
): boolean {
    if (mode === "all") return true;
    if (mode === "archived") return !!m.archived_at;
    return !m.archived_at;
}

function matchesSearch(m: Doc<"members">, search: string): boolean {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
        (m.name?.toLowerCase().includes(q) ?? false) ||
        (m.email?.toLowerCase().includes(q) ?? false) ||
        (m.phone?.toLowerCase().includes(q) ?? false) ||
        (m.other_names?.toLowerCase().includes(q) ?? false)
    );
}

// Get all members with details and organization/role-based filtering.
// Prefer `listPage` for the directory UI; keep this for pickers/exports.
export const getAll = query({
    args: {
        organization_id: v.optional(v.id("organizations")),
        filter: v.optional(v.union(v.literal("active"), v.literal("archived"), v.literal("all"))),
    },
    handler: async (ctx, args) => {
        const user = await getUserSafe(ctx);
        if (!user) return [];

        const scope = await resolveManagedMemberIds(ctx);
        const mode = args.filter ?? "active";
        let members: Doc<"members">[] = [];

        if (scope === "all") {
            if (args.organization_id) {
                members = await ctx.db
                    .query("members")
                    .withIndex("by_org", (q) => q.eq("organization_id", args.organization_id))
                    .collect();
            } else {
                members = await ctx.db.query("members").collect();
            }
        } else if (scope === "org") {
            const orgId =
                normalizeOrgId(ctx, args.organization_id) ??
                normalizeOrgId(ctx, user.organization_id);
            if (!orgId) return [];
            members = await ctx.db
                .query("members")
                .withIndex("by_org", (q) => q.eq("organization_id", orgId))
                .collect();
        } else if (scope.size === 0) {
            return [];
        } else {
            const docs = await Promise.all(
                Array.from(scope).map((id) => ctx.db.get(id)),
            );
            members = docs.filter((m): m is Doc<"members"> => m !== null);
        }

        members = members.filter((m) => matchesArchiveFilter(m, mode));
        members.sort((a, b) => a.name.localeCompare(b.name));
        return await Promise.all(members.map(async (m) => formatMember(ctx, m)));
    },
});

/**
 * Shared arg validators for every directory facet filter, so `listPage` and
 * the share-link mutation resolve *exactly* the same set — a share link that
 * disagreed with the list the admin was looking at would be worse than no
 * share link at all.
 */
export const memberFilterArgs = {
    organization_id: v.optional(v.id("organizations")),
    filter: v.optional(v.union(v.literal("active"), v.literal("archived"), v.literal("all"))),
    search: v.optional(v.string()),
    status: v.optional(v.string()),
    // Directory facet filters. Applied server-side across the whole scoped
    // set *before* slicing, so "Load more" paginates the filtered result
    // rather than the client having to load every page before it can
    // filter locally.
    statuses: v.optional(v.array(v.string())),
    unit_ids: v.optional(v.array(v.id("units"))),
    label_ids: v.optional(v.array(v.id("labels"))),
    household_ids: v.optional(v.array(v.id("households"))),
    no_household: v.optional(v.boolean()),
    risk_levels: v.optional(v.array(v.string())),
};

export type MemberFilterArgs = {
    organization_id?: Id<"organizations">;
    filter?: "active" | "archived" | "all";
    search?: string;
    status?: string;
    statuses?: string[];
    unit_ids?: Id<"units">[];
    label_ids?: Id<"labels">[];
    household_ids?: Id<"households">[];
    no_household?: boolean;
    risk_levels?: string[];
};

/**
 * Every member the caller may see that matches the given facet filters,
 * sorted by name. Returns `[]` when the caller has no scope at all.
 */
export async function resolveFilteredMembers(
    ctx: Ctx,
    args: MemberFilterArgs,
): Promise<Doc<"members">[]> {
    const user = await getUserSafe(ctx);
    if (!user) return [];

    const mode = args.filter ?? "active";
    const search = (args.search ?? "").trim();
    const scope = await resolveManagedMemberIds(ctx);

    let members: Doc<"members">[] = [];

    if (scope === "all") {
        if (args.organization_id) {
            members = await ctx.db
                .query("members")
                .withIndex("by_org", (q) => q.eq("organization_id", args.organization_id))
                .collect();
        } else {
            members = await ctx.db.query("members").collect();
        }
    } else if (scope === "org") {
        const orgId =
            normalizeOrgId(ctx, args.organization_id) ??
            normalizeOrgId(ctx, user.organization_id);
        if (!orgId) return [];
        members = await ctx.db
            .query("members")
            .withIndex("by_org", (q) => q.eq("organization_id", orgId))
            .collect();
    } else if (scope.size === 0) {
        return [];
    } else {
        const docs = await Promise.all(
            Array.from(scope).map((id) => ctx.db.get(id)),
        );
        members = docs.filter((m): m is Doc<"members"> => m !== null);
    }

    members = members.filter((m) => matchesArchiveFilter(m, mode));
    if (args.status) {
        members = members.filter((m) => m.status === args.status);
    }
    if (args.statuses && args.statuses.length > 0) {
        const wanted = new Set(args.statuses);
        members = members.filter((m) => wanted.has(m.status));
    }
    if (search) {
        members = members.filter((m) => matchesSearch(m, search));
    }

    // Unit / label filters resolve through junction tables. Gather the set
    // of member ids belonging to ANY selected unit/label (union), then keep
    // members in that set.
    if (args.unit_ids && args.unit_ids.length > 0) {
        const inUnits = new Set<string>();
        await Promise.all(
            args.unit_ids.map(async (uid) => {
                const rows = await ctx.db
                    .query("member_units")
                    .withIndex("by_unit", (q) => q.eq("unit_id", uid))
                    .collect();
                rows.forEach((r) => inUnits.add(r.member_id));
            }),
        );
        members = members.filter((m) => inUnits.has(m._id));
    }
    if (args.label_ids && args.label_ids.length > 0) {
        const withLabel = new Set<string>();
        await Promise.all(
            args.label_ids.map(async (lid) => {
                const rows = await ctx.db
                    .query("member_labels")
                    .withIndex("by_label", (q) => q.eq("label_id", lid))
                    .collect();
                rows.forEach((r) => withLabel.add(r.member_id));
            }),
        );
        members = members.filter((m) => withLabel.has(m._id));
    }

    const householdIds = args.household_ids ?? [];
    if (householdIds.length > 0 || args.no_household) {
        const wanted = new Set<string>(householdIds);
        members = members.filter((m) => {
            const hid = m.household_id as string | undefined;
            if (!hid) return !!args.no_household;
            return wanted.has(hid);
        });
    }

    if (args.risk_levels && args.risk_levels.length > 0) {
        const wanted = new Set(args.risk_levels);
        members = members.filter((m) => wanted.has(m.engagement_risk_level ?? ""));
    }

    members.sort((a, b) => a.name.localeCompare(b.name));
    return members;
}

/**
 * Paginated member directory with optional server-side search + facet filters.
 * Cursor is a simple offset encoded as a string (stable for name-sorted lists).
 */
export const listPage = query({
    args: {
        ...memberFilterArgs,
        pageSize: v.optional(v.number()),
        cursor: v.optional(v.string()),
        // Sorted here across the whole filtered set, so a sorted directory is
        // right even before every page is loaded. Name ascending by default.
        sort: v.optional(v.union(
            v.literal("name"),
            v.literal("status"),
            v.literal("joined_date"),
            v.literal("last_attendance"),
            v.literal("score"),
        )),
        sort_dir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    },
    handler: async (ctx, args) => {
        // The client grows pageSize on "Load more" rather than advancing an
        // offset (so the visible list stays fully reactive to archives/
        // creates instead of needing a merge) -- cap high enough to cover
        // realistic org sizes rather than the old fixed 100.
        const pageSize = Math.min(Math.max(args.pageSize ?? 50, 1), 2000);
        const offset = args.cursor ? Math.max(0, parseInt(args.cursor, 10) || 0) : 0;

        const caches = newDirectoryCaches();
        const members = await sortMembers(
            ctx,
            await resolveFilteredMembers(ctx, args),
            args.sort ?? "name",
            args.sort_dir ?? "asc",
            caches,
        );

        const totalCount = members.length;
        const slice = members.slice(offset, offset + pageSize);
        const nextOffset = offset + pageSize;
        const isDone = nextOffset >= totalCount;

        // Labels and last attendance only for the rows being returned.
        const page = await Promise.all(
            slice.map(async (m) => ({
                ...(await formatMember(ctx, m)),
                ...(await directoryDetails(ctx, m, caches)),
            })),
        );
        return {
            page,
            nextCursor: isDone ? null : String(nextOffset),
            totalCount,
            // Of those, how many have the Active status, so the directory can
            // say "392 people · 346 active" rather than a bare figure that
            // disagrees with the dashboard's active-member count.
            activeCount: members.filter((m) => m.status === "active").length,
            isDone,
        };
    },
});

// Debug: resolve current user's linked member and managed scope
export const debugCurrentUser = query({
    args: {},
    handler: async (ctx) => {
        const user = await getUserSafe(ctx);
        if (!user) return null;

        let member = await ctx.db
            .query("members")
            .withIndex("by_user_id", (q: any) => q.eq("user_id", user._id))
            .first();

        if (!member && user.email) {
            member = await ctx.db
                .query("members")
                .withIndex("by_email", (q: any) => q.eq("email", user.email))
                .first();
        }

        let ledUnits: Doc<"units">[] = [];
        if (member) {
            ledUnits = await ctx.db
                .query("units")
                .filter((q: any) => q.eq(q.field("leader_id"), member!._id))
                .collect();
        }

        const managedIds = await resolveManagedMemberIds(ctx);
        const managedMemberIds =
            managedIds === "all" || managedIds === "org"
                ? [managedIds]
                : Array.from(managedIds);

        const ledUnitsWithCounts = await Promise.all(
            ledUnits.map(async (u) => {
                const relations = await ctx.db
                    .query("member_units")
                    .withIndex("by_unit", (q: any) => q.eq("unit_id", u._id))
                    .collect();
                const members = await Promise.all(relations.map(r => ctx.db.get(r.member_id)));
                const existingMemberIds = members.filter(Boolean).map(m => (m as Doc<"members">)._id);
                const missingMemberIds = relations
                    .map(r => r.member_id)
                    .filter(id => !existingMemberIds.includes(id));
                return {
                    id: u._id,
                    name: u.name,
                    memberCount: relations.length,
                    existingMemberCount: existingMemberIds.length,
                    missingMemberIds: missingMemberIds.slice(0, 10),
                };
            })
        );

        return {
            user: {
                id: user._id,
                role: user.role,
                email: user.email,
                name: user.name,
                organization_id: user.organization_id,
            },
            member: member
                ? {
                    id: member._id,
                    name: member.name,
                    email: member.email,
                    organization_id: member.organization_id,
                }
                : null,
            ledUnits: ledUnitsWithCounts,
            managedMemberIds,
        };
    },
});

// Cleanup orphaned member_units rows (where member no longer exists)
export const cleanupOrphanMemberUnits = mutation({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) throw new Error("Organization not set");

        const units = await ctx.db
            .query("units")
            .withIndex("by_org", (q: any) => q.eq("organization_id", orgId))
            .collect();

        let removed = 0;
        for (const unit of units) {
            const relations = await ctx.db
                .query("member_units")
                .withIndex("by_unit", (q: any) => q.eq("unit_id", unit._id))
                .collect();
            for (const rel of relations) {
                const member = await ctx.db.get(rel.member_id);
                if (!member) {
                    await ctx.db.delete(rel._id);
                    removed += 1;
                }
            }
        }

        return { removed };
    },
});

// Merge duplicate members - hybrid approach based on phone availability
export const mergeDuplicatesByNamePhone = mutation({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) throw new Error("Organization not set");

        const members = await ctx.db
            .query("members")
            .withIndex("by_org", (q: any) => q.eq("organization_id", orgId))
            .collect();

        const normalizePhone = (phone?: string | null) => (phone || "").replace(/\D/g, "");
        const normalizeFirst = (name?: string | null) => (name || "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
        const normalizeLast = (name?: string | null) => {
            const parts = (name || "").trim().split(/\s+/);
            return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
        };
        const isEmpty = (v: any) => v === undefined || v === null || v === "";
        const hasRealPhone = (phone?: string | null) => {
            const normalized = normalizePhone(phone);
            return normalized && normalized !== "0000000000";
        };

        // Hybrid grouping strategy:
        // - If member has real phone: group by first + last + phone
        // - If member has no real phone: group by first + last name only
        // - If ANY member has no real phone, we use name-only matching for that group
        const groups = new Map<string, Doc<"members">[]>();
        for (const m of members) {
            const first = normalizeFirst(m.name);
            const last = normalizeLast(m.name);
            const phone = normalizePhone(m.phone);
            if (!first || !last) continue;

            // Always create a name-only key for potential merging
            const nameKey = `name:${first}|${last}`;

            if (hasRealPhone(m.phone)) {
                // Has real phone - also create a phone-specific key
                const phoneKey = `${first}|${last}|${phone}`;
                const phoneBucket = groups.get(phoneKey) ?? [];
                phoneBucket.push(m);
                groups.set(phoneKey, phoneBucket);
            }

            // Always add to name-only group (for merging with members without phones)
            const nameBucket = groups.get(nameKey) ?? [];
            nameBucket.push(m);
            groups.set(nameKey, nameBucket);
        }

        // Now merge groups: if a member appears in both name-only and phone-specific groups,
        // prefer the phone-specific group (more confident match)
        const finalGroups = new Map<string, Doc<"members">[]>();
        for (const [key, group] of groups.entries()) {
            if (key.startsWith("name:")) {
                // Name-only group: only use if no phone-specific group exists for these members
                const hasPhoneSpecificGroup = group.some(m => {
                    if (!hasRealPhone(m.phone)) return false;
                    const phoneKey = `${normalizeFirst(m.name)}|${normalizeLast(m.name)}|${normalizePhone(m.phone)}`;
                    return groups.has(phoneKey) && groups.get(phoneKey)!.length > 1;
                });
                if (!hasPhoneSpecificGroup) {
                    finalGroups.set(key, group);
                }
            } else {
                // Phone-specific group: only use if it has multiple members
                // (single-member phone groups are less confident than name-only groups)
                if (group.length > 1) {
                    finalGroups.set(key, group);
                }
            }
        }

        let mergedGroups = 0;
        let removed = 0;

        for (const group of finalGroups.values()) {
            if (group.length < 2) continue;
            mergedGroups += 1;

            // Sort: prefer real phone over placeholder, then most recent
            const sorted = group.sort((a, b) => {
                const phoneA = normalizePhone(a.phone);
                const phoneB = normalizePhone(b.phone);

                // Prefer member with real phone over placeholder
                if (hasRealPhone(a.phone) && !hasRealPhone(b.phone)) return -1;
                if (!hasRealPhone(a.phone) && hasRealPhone(b.phone)) return 1;

                // Both have real phones or both have placeholders - prefer most recent
                return b._creationTime - a._creationTime;
            });
            const primary = sorted[0];
            const duplicates = sorted.slice(1);

            for (const dup of duplicates) {
                const updates: Record<string, any> = {};
                const fields: (keyof Doc<"members">)[] = [
                    "name",
                    "email",
                    "phone",
                    "status",
                    "dob",
                    "birth_month",
                    "birth_day",
                    "gender",
                    "marital_status",
                    "anniversary",
                    "address",
                    "city",
                    "state",
                    "zip",
                    "country",
                    "latitude",
                    "longitude",
                    "plus_code",
                    "avatar_url",
                    "user_id",
                    "joined_date",
                    "skills",
                ];

                for (const f of fields) {
                    // If primary is missing and dup has value, fill it
                    if (isEmpty((primary as any)[f]) && !isEmpty((dup as any)[f])) {
                        updates[f as string] = (dup as any)[f];
                    }
                }

                if (Object.keys(updates).length > 0) {
                    await ctx.db.patch(primary._id, updates);
                }

                // Merge member_units
                const dupUnits = await ctx.db
                    .query("member_units")
                    .withIndex("by_member", (q: any) => q.eq("member_id", dup._id))
                    .collect();
                for (const mu of dupUnits) {
                    const existing = await ctx.db
                        .query("member_units")
                        .withIndex("by_member_unit", (q: any) => q.eq("member_id", primary._id).eq("unit_id", mu.unit_id))
                        .first();
                    if (!existing) {
                        await ctx.db.insert("member_units", {
                            member_id: primary._id,
                            unit_id: mu.unit_id,
                            joined_date: mu.joined_date,
                            role: mu.role,
                            is_active: mu.is_active,
                        });
                    }
                    await ctx.db.delete(mu._id);
                }

                // Merge member_labels
                const dupLabels = await ctx.db
                    .query("member_labels")
                    .withIndex("by_member", (q: any) => q.eq("member_id", dup._id))
                    .collect();
                for (const ml of dupLabels) {
                    const existing = await ctx.db
                        .query("member_labels")
                        .withIndex("by_member", (q: any) => q.eq("member_id", primary._id))
                        .filter((q: any) => q.eq(q.field("label_id"), ml.label_id))
                        .first();
                    if (!existing) {
                        await ctx.db.insert("member_labels", {
                            member_id: primary._id,
                            label_id: ml.label_id,
                            assigned_by: ml.assigned_by,
                            assigned_by_name: ml.assigned_by_name,
                        });
                    }
                    await ctx.db.delete(ml._id);
                }

                // Merge member_attendance
                const dupAttendance = await ctx.db
                    .query("member_attendance")
                    .withIndex("by_member", (q: any) => q.eq("member_id", dup._id))
                    .collect();
                for (const ma of dupAttendance) {
                    const existing = await ctx.db
                        .query("member_attendance")
                        .withIndex("by_member", (q: any) => q.eq("member_id", primary._id))
                        .filter((q: any) => q.eq(q.field("attendance_id"), ma.attendance_id))
                        .first();
                    if (!existing) {
                        await ctx.db.insert("member_attendance", {
                            member_id: primary._id,
                            attendance_id: ma.attendance_id,
                        });
                    }
                    await ctx.db.delete(ma._id);
                }

                // Update invitations
                const dupInvites = await ctx.db
                    .query("invitations")
                    .filter((q: any) => q.eq(q.field("member_id"), dup._id))
                    .collect();
                for (const inv of dupInvites) {
                    await ctx.db.patch(inv._id, { member_id: primary._id });
                }

                // Update financial transactions
                const dupTransactions = await ctx.db
                    .query("financial_transactions")
                    .filter((q: any) => q.eq(q.field("member_id"), dup._id))
                    .collect();
                for (const ft of dupTransactions) {
                    await ctx.db.patch(ft._id, { member_id: primary._id, member_name: primary.name });
                }

                // Delete duplicate member
                await ctx.db.delete(dup._id);
                removed += 1;
            }
        }

        return { mergedGroups, removed };
    },
});

// Get member by ID
export const getById = query({
    args: { id: v.id("members") },
    handler: async (ctx, args) => {
        const member = await ctx.db.get(args.id);
        if (!member) return null;
        const user = await getUserSafe(ctx);
        if (!user) throw new Error("Forbidden");
        const managedIds = await resolveManagedMemberIds(ctx);
        if (managedIds === "all") return await formatMember(ctx, member);
        if (managedIds === "org") {
            const userOrg = normalizeOrgId(ctx, user.organization_id);
            if (userOrg && member.organization_id === userOrg) {
                return await formatMember(ctx, member);
            }
            throw new Error("Forbidden");
        }
        if (managedIds.has(member._id)) return await formatMember(ctx, member);
        throw new Error("Forbidden");
    },
});

// Create member
export const create = mutation({
    args: {
        name: v.string(),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        status: v.string(),
        dob: v.optional(v.string()),
        birth_month: v.optional(v.number()),
        birth_day: v.optional(v.number()),
        gender: v.optional(v.string()),
        marital_status: v.optional(v.string()),
        organization_id: v.optional(v.id("organizations")),
        // All unit assignments go through unit_ids
        unit_ids: v.optional(v.array(v.id("units"))),
        // Address fields
        address: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        zip: v.optional(v.string()),
        country: v.optional(v.string()),
        latitude: v.optional(v.number()),
        longitude: v.optional(v.number()),
        plus_code: v.optional(v.string()),
        avatar_url: v.optional(v.string()),
        user_id: v.optional(v.id("users")),
        joined_date: v.optional(v.string()),
        skills: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireWriteAccess(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        const { unit_ids, ...memberData } = args;

        // Unit-level admins may only create members within units they administer.
        const unitScope = await getAdministeredUnitIds(ctx);
        if (unitScope !== "all") {
            if (!unit_ids || unit_ids.length === 0) {
                throw new Error("Forbidden: you can only add members to units you administer");
            }
            const outside = unit_ids.filter((uid) => !unitScope.has(uid));
            if (outside.length > 0) {
                throw new Error("Forbidden: one or more units are outside your scope");
            }
        }

        if (orgId) {
            await assertMemberLimit(ctx, orgId, 1);
        }

        const now = new Date().toISOString();
        const memberId = await ctx.db.insert("members", {
            ...memberData,
            organization_id: orgId ?? memberData.organization_id,
            created_at: now,
            updated_at: now,
        });

        // Add unit assignments if provided (many-to-many) - includes all generic units
        if (unit_ids && unit_ids.length > 0) {
            await Promise.all(unit_ids.map(unitId =>
                ctx.db.insert("member_units", {
                    member_id: memberId,
                    unit_id: unitId,
                    joined_date: new Date().toISOString(),
                    is_active: true
                })
            ));
        }

        // Audit log
        await ctx.runMutation(internal.audit.logEvent, {
            action: "member.created",
            entity_type: "member",
            entity_id: memberId,
            entity_name: args.name,
            performed_by: user.clerk_user_id,
            performed_by_name: user.name || user.email || "Unknown",
            performed_by_role: user.role,
            organization_id: orgId ?? memberData.organization_id,
            changes: { member: { name: args.name, email: args.email, status: args.status } },
        });

        const member = await ctx.db.get(memberId);
        if (!member) throw new Error("Member not found");

        // Automation: fire the "new member added" trigger.
        const emitOrg = orgId ?? memberData.organization_id;
        if (emitOrg) {
            await emitEventSafe(ctx, {
                orgId: emitOrg,
                triggerKey: "member.created",
                memberId,
            });
        }

        return await formatMember(ctx, member);
    },
});

// Create multiple members (Bulk)
export const createBulk = mutation({
    args: {
        members: v.array(v.object({
            name: v.string(),
            other_names: v.optional(v.string()), // Additional names when multiple names provided
            first_name: v.optional(v.string()),
            last_name: v.optional(v.string()),
            email: v.optional(v.string()),
            phone: v.optional(v.string()),
            status: v.string(),
            dob: v.optional(v.string()),
            birth_month: v.optional(v.number()),
            birth_day: v.optional(v.number()),
            gender: v.optional(v.string()),
            address: v.optional(v.string()),
            city: v.optional(v.string()),
            state: v.optional(v.string()),
            zip: v.optional(v.string()),
            country: v.optional(v.string()),
            plus_code: v.optional(v.string()),
            avatar_url: v.optional(v.string()),
            organization_id: v.optional(v.id("organizations")),
            user_id: v.optional(v.id("users")),
            // Dynamic units to assign/create
            units: v.optional(v.array(v.object({
                name: v.string(),
                type: v.string() // 'geographic', 'functional', etc.
            })))
        })),
        target_unit_id: v.optional(v.id("units")), // Optional: assign all to this existing unit
        organization_id: v.optional(v.id("organizations"))
    },
    handler: async (ctx, args) => {
        const results: Id<"members">[] = [];
        let createdCount = 0;
        let updatedCount = 0;
        await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);

        if (!orgId) {
            throw new Error("Organization ID is required for bulk upload");
        }

        // Pre-check Free plan capacity for net-new rows (updates don't count).
        // Exact creates are enforced again as we go; this fails fast on huge imports.
        await assertMemberLimit(ctx, orgId, 0);

        const normalizePhone = (phone?: string | null) => (phone || "").replace(/\D/g, "");
        const normalizeName = (name?: string | null) => (name || "").trim().toLowerCase();
        const extractFirstName = (fullName?: string | null) => {
            if (!fullName) return "";
            return fullName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
        };

        // 1. Analyze all units in the batch to find unique ones
        const unitsToResolve = new Map<string, string>(); // name -> type
        for (const m of args.members) {
            if (m.units) {
                for (const u of m.units) {
                    // normalize name key
                    unitsToResolve.set(u.name.trim(), u.type);
                }
            }
        }

        // 2. Resolve existing units
        const unitNameMap = new Map<string, Id<"units">>();
        const existingUnits = await ctx.db
            .query("units")
            .withIndex("by_org", q => q.eq("organization_id", orgId))
            .collect();

        for (const u of existingUnits) {
            unitNameMap.set(u.name.toLowerCase().trim(), u._id);
        }

        // 3. Create missing units
        for (const [name, type] of unitsToResolve.entries()) {
            const lowerName = name.toLowerCase();
            if (!unitNameMap.has(lowerName)) {
                // Create new unit
                const newUnitId = await ctx.db.insert("units", {
                    name: name,
                    type: type,
                    organization_id: orgId,
                    active: true,
                    description: "Auto-created via bulk upload"
                });
                unitNameMap.set(lowerName, newUnitId);
            }
        }

        // 4. Load existing members for matching (first name + phone)
        const existingMembers = await ctx.db
            .query("members")
            .withIndex("by_org", q => q.eq("organization_id", orgId))
            .collect();

        const membersByPhone = new Map<string, Doc<"members">[]>();
        for (const m of existingMembers) {
            const phone = normalizePhone(m.phone);
            if (!phone) continue;
            const bucket = membersByPhone.get(phone) ?? [];
            bucket.push(m);
            membersByPhone.set(phone, bucket);
        }

        // 5. Create or update members and link units
        for (const memberData of args.members) {
            const { units, first_name, last_name, ...coreMemberData } = memberData;

            const normalizedPhone = normalizePhone(coreMemberData.phone);
            const inputFirstName = normalizeName(first_name) || extractFirstName(coreMemberData.name);
            const candidates = normalizedPhone ? membersByPhone.get(normalizedPhone) ?? [] : [];
            const match = candidates.find(c => extractFirstName(c.name) === inputFirstName);

            const unitIdsToLink = new Set<Id<"units">>();
            if (args.target_unit_id) unitIdsToLink.add(args.target_unit_id);
            if (units) {
                for (const u of units) {
                    const id = unitNameMap.get(u.name.toLowerCase().trim());
                    if (id) unitIdsToLink.add(id);
                }
            }

            if (match) {
                const nameFromParts = `${first_name ?? ""} ${last_name ?? ""}`.trim();
                const nameToUse = nameFromParts || coreMemberData.name;
                const updates: Record<string, any> = {};
                const addIfDefined = (key: string, value: any) => {
                    if (value === undefined || value === null || value === "") return;
                    updates[key] = value;
                };

                addIfDefined("name", nameToUse);
                addIfDefined("email", coreMemberData.email);
                addIfDefined("phone", coreMemberData.phone);
                addIfDefined("status", coreMemberData.status);
                addIfDefined("dob", coreMemberData.dob);
                addIfDefined("birth_month", coreMemberData.birth_month);
                addIfDefined("birth_day", coreMemberData.birth_day);
                addIfDefined("gender", coreMemberData.gender);
                addIfDefined("address", coreMemberData.address);
                addIfDefined("city", coreMemberData.city);
                addIfDefined("state", coreMemberData.state);
                addIfDefined("zip", coreMemberData.zip);
                addIfDefined("country", coreMemberData.country);
                addIfDefined("plus_code", coreMemberData.plus_code);
                addIfDefined("avatar_url", coreMemberData.avatar_url);
                addIfDefined("user_id", coreMemberData.user_id);

                if (Object.keys(updates).length > 0) {
                    await ctx.db.patch(match._id, updates);
                }

                if (unitIdsToLink.size > 0) {
                    const existingLinks = await ctx.db
                        .query("member_units")
                        .withIndex("by_member", q => q.eq("member_id", match._id))
                        .collect();
                    const existingUnitIds = new Set(existingLinks.map(l => l.unit_id));
                    const newLinks = Array.from(unitIdsToLink).filter(uid => !existingUnitIds.has(uid));
                    if (newLinks.length > 0) {
                        await Promise.all(newLinks.map(uid =>
                            ctx.db.insert("member_units", {
                                member_id: match._id,
                                unit_id: uid,
                                joined_date: new Date().toISOString(),
                                is_active: true
                            })
                        ));
                    }
                }

                results.push(match._id);
                updatedCount += 1;
                continue;
            }

            await assertMemberLimit(ctx, orgId, 1);

            const memberId = await ctx.db.insert("members", {
                ...coreMemberData,
                organization_id: orgId ?? coreMemberData.organization_id,
            });
            results.push(memberId);
            createdCount += 1;

            // Collect unit IDs to link
            // unitIdsToLink already computed above
            // Insert member_units
            if (unitIdsToLink.size > 0) {
                await Promise.all(Array.from(unitIdsToLink).map(uid =>
                    ctx.db.insert("member_units", {
                        member_id: memberId,
                        unit_id: uid,
                        joined_date: new Date().toISOString(),
                        is_active: true
                    })
                ));
            }
        }
        return {
            created: createdCount,
            updated: updatedCount,
            processed: args.members.length,
            memberIds: results,
        };
    },
});

// Update member
export const update = mutation({
    args: {
        id: v.id("members"),
        updates: v.object({
            name: v.optional(v.string()),
            email: v.optional(v.string()),
            phone: v.optional(v.string()),
            status: v.optional(v.string()),
            dob: v.optional(v.string()),
            birth_month: v.optional(v.number()),
            birth_day: v.optional(v.number()),
            gender: v.optional(v.string()),
            marital_status: v.optional(v.string()),
            anniversary: v.optional(v.string()),
            address: v.optional(v.string()),
            city: v.optional(v.string()),
            state: v.optional(v.string()),
            zip: v.optional(v.string()),
            country: v.optional(v.string()),
            latitude: v.optional(v.number()),
            longitude: v.optional(v.number()),
            plus_code: v.optional(v.string()),
            avatar_url: v.optional(v.string()),
            user_id: v.optional(v.id("users")),
            joined_date: v.optional(v.string()),
            skills: v.optional(v.string()),
        }),
        unit_ids: v.optional(v.array(v.id("units"))), // All unit assignments
    },
    handler: async (ctx, args) => {
        const { id, updates, unit_ids } = args;

        const user = await requireWriteAccess(ctx);
        const managedIds = await resolveManagedMemberIds(ctx);
        const currentMember = await ctx.db.get(id);
        if (!currentMember) throw new Error("Member not found");
        if (
            !memberIdInScope(
                id,
                currentMember.organization_id,
                managedIds,
                callerOrgId(ctx, user),
            )
        ) {
            throw new Error("Forbidden");
        }

        // Track what changed for audit log
        const changedFields: Record<string, { before: any; after: any }> = {};
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined && (currentMember as any)[key] !== value) {
                changedFields[key] = {
                    before: (currentMember as any)[key],
                    after: value
                };
            }
        }

        // Add updated_at timestamp
        const now = new Date().toISOString();
        await ctx.db.patch(id, { ...updates, updated_at: now });

        // Update unit assignments if provided (replace all)
        if (unit_ids !== undefined) {
            // Unit-level admins may only reassign members to units they
            // administer (mirrors the guard in create). Without this, a
            // unit_admin could move a member into any unit, including units
            // in other organizations.
            const unitScope = await getAdministeredUnitIds(ctx);
            if (unitScope !== "all") {
                const outside = unit_ids.filter((uid) => !unitScope.has(uid));
                if (outside.length > 0) {
                    throw new Error("Forbidden: one or more units are outside your scope");
                }
            }

            // Delete existing unit assignments
            const existing = await ctx.db
                .query("member_units")
                .withIndex("by_member", q => q.eq("member_id", id))
                .collect();

            await Promise.all(existing.map(r => ctx.db.delete(r._id)));

            // Add new unit assignments
            await Promise.all(unit_ids.map(unitId =>
                ctx.db.insert("member_units", {
                    member_id: id,
                    unit_id: unitId,
                    joined_date: new Date().toISOString(),
                    is_active: true
                })
            ));
        }

        const member = await ctx.db.get(id);
        if (!member) throw new Error("Member not found");

        // Log audit event for member update
        if (Object.keys(changedFields).length > 0) {
            await ctx.runMutation(internal.audit.logEvent, {
                action: "member.updated",
                entity_type: "member",
                entity_id: id,
                entity_name: member.name,
                performed_by: user.clerk_user_id,
                performed_by_name: user.name || user.email || "Unknown",
                performed_by_role: user.role,
                organization_id: member.organization_id,
                changes: changedFields,
            });
        }

        return await formatMember(ctx, member);
    },
});

// Get members managed by the current user
export const getManagedMembers = query({
    args: {},
    handler: async (ctx) => {
        const user = await getUserSafe(ctx);
        if (!user) return [];
        const managedIds = await resolveManagedMemberIds(ctx);

        if (managedIds === "all") {
            const allMembers = await ctx.db.query("members").collect();
            return await Promise.all(
                allMembers.filter((m) => !m.archived_at).map((m) => formatMember(ctx, m)),
            );
        }
        if (managedIds === "org") {
            const orgId = callerOrgId(ctx, user);
            if (!orgId) return [];
            const orgMembers = await ctx.db
                .query("members")
                .withIndex("by_org", (q) => q.eq("organization_id", orgId))
                .collect();
            return await Promise.all(
                orgMembers.filter((m) => !m.archived_at).map((m) => formatMember(ctx, m)),
            );
        }

        if (managedIds.size === 0) return [];

        const managedMembers = await Promise.all(
            Array.from(managedIds).map((id) => ctx.db.get(id)),
        );
        return await Promise.all(
            managedMembers
                .filter((m): m is Doc<"members"> => !!m && !m.archived_at)
                .map((m) => formatMember(ctx, m)),
        );
    },
});

export const getRecent = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 5;
        const user = await getUserSafe(ctx);
        if (!user) return [];
        const managedIds = await resolveManagedMemberIds(ctx);

        let members: Doc<"members">[];
        if (managedIds === "all") {
            members = (await ctx.db.query("members").order("desc").take(limit * 2))
                .filter((m) => !m.archived_at)
                .slice(0, limit);
        } else if (managedIds === "org") {
            const orgId = callerOrgId(ctx, user);
            if (!orgId) return [];
            members = (
                await ctx.db
                    .query("members")
                    .withIndex("by_org", (q) => q.eq("organization_id", orgId))
                    .order("desc")
                    .take(limit * 2)
            )
                .filter((m) => !m.archived_at)
                .slice(0, limit);
        } else {
            if (managedIds.size === 0) return [];
            const managedMembers = await Promise.all(
                Array.from(managedIds).map((id) => ctx.db.get(id)),
            );
            members = managedMembers
                .filter((m): m is Doc<"members"> => m !== null && !m.archived_at)
                .sort((a, b) => b._creationTime - a._creationTime)
                .slice(0, limit);
        }

        return await Promise.all(members.map((m) => formatMember(ctx, m)));
    },
});

// Bulk add members to a unit
export const bulkAddToUnit = mutation({
    args: {
        member_ids: v.array(v.id("members")),
        unit_id: v.id("units"),
    },
    handler: async (ctx, args) => {
        await requireWriteAccess(ctx);

        const unit = await ctx.db.get(args.unit_id);
        if (!unit) throw new Error("Unit not found");

        // Unit-level admins may only add members to units they administer.
        const unitScope = await getAdministeredUnitIds(ctx);
        if (unitScope !== "all" && !unitScope.has(args.unit_id)) {
            throw new Error("Forbidden: unit is outside your scope");
        }

        // Verify all members exist and belong to the same organization
        const members = await Promise.all(
            args.member_ids.map(id => ctx.db.get(id))
        );

        for (const member of members) {
            if (!member) throw new Error("Member not found");
            if (member.organization_id !== unit.organization_id) {
                throw new Error("Member and unit must belong to the same organization");
            }
        }

        // Check for existing assignments to avoid duplicates
        const existingAssignments = await ctx.db
            .query("member_units")
            .withIndex("by_unit", q => q.eq("unit_id", args.unit_id))
            .collect();

        const existingMemberIds = new Set(existingAssignments.map(a => a.member_id));

        // Add only members who aren't already in the unit
        const addedCount = await Promise.all(
            args.member_ids
                .filter(memberId => !existingMemberIds.has(memberId))
                .map(memberId =>
                    ctx.db.insert("member_units", {
                        member_id: memberId,
                        unit_id: args.unit_id,
                        joined_date: new Date().toISOString(),
                        is_active: true
                    })
                )
        );

        return { added: addedCount.length, skipped: args.member_ids.length - addedCount.length };
    },
});

// Bulk update member status
export const bulkUpdateStatus = mutation({
    args: {
        member_ids: v.array(v.id("members")),
        status: v.string(),
    },
    handler: async (ctx, args) => {
        const allowedStatuses = new Set(["active", "inactive", "visitor"]);
        if (!allowedStatuses.has(args.status)) {
            throw new Error("Invalid status");
        }

        const user = await requireWriteAccess(ctx);
        const managedIds = await resolveManagedMemberIds(ctx);
        const orgId = callerOrgId(ctx, user);

        const members = await Promise.all(args.member_ids.map((id) => ctx.db.get(id)));
        if (members.some((m) => !m)) throw new Error("Member not found");

        for (const m of members) {
            if (
                !m ||
                !memberIdInScope(m._id, m.organization_id, managedIds, orgId)
            ) {
                throw new Error("Forbidden");
            }
        }

        await Promise.all(args.member_ids.map((id) => ctx.db.patch(id, { status: args.status })));

        return { updated: args.member_ids.length };
    },
});

export const getInsights = query({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const orgId = isSuperAdmin(user) ? args.organization_id : await resolveOrgId(ctx, args.organization_id);

        // Unit-level admins get insights about their own roster: every figure
        // below — demographics, engagement, retention, the at-risk list — is
        // derived from `members`, which is narrowed to the members they manage.
        const memberScope = await resolveManagedMemberIds(ctx);
        const scopedIds = isOrgWideScope(memberScope) ? null : memberScope;

        const members = (orgId
            ? await ctx.db.query("members").withIndex("by_org", (q: any) => q.eq("organization_id", orgId)).collect()
            : await ctx.db.query("members").collect()
        ).filter((m) => !m.archived_at && (!scopedIds || scopedIds.has(m._id)));

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const formatDate = (d: Date) => d.toISOString().split('T')[0];

        // Every series here looks back at most 12 months, so only that slice of
        // attendance is read — and only for this org. (It used to scan the whole
        // `attendance` and `member_attendance` tables across every org, which
        // both mixed other orgs into the counts and grew without bound.)
        const windowStart = formatDate(new Date(now.getFullYear(), now.getMonth() - 11, 1));
        const attendanceRecords = orgId
            ? await ctx.db
                .query("attendance")
                .withIndex("by_org_and_date", (q) =>
                    q.eq("organization_id", orgId).gte("date", windowStart),
                )
                .collect()
            : await ctx.db
                .query("attendance")
                .withIndex("by_date", (q) => q.gte("date", windowStart))
                .collect();

        // Who was present at each service, restricted to the members in view.
        const memberIdsInView = new Set(members.map(m => m._id));
        const presentByRecord = new Map<Id<"attendance">, Set<Id<"members">>>();
        for (const record of attendanceRecords) {
            const rows = await ctx.db
                .query("member_attendance")
                .withIndex("by_attendance", (q) => q.eq("attendance_id", record._id))
                .collect();
            const present = new Set<Id<"members">>();
            for (const row of rows) {
                if (memberIdsInView.has(row.member_id)) present.add(row.member_id);
            }
            presentByRecord.set(record._id, present);
        }

        // Headcount per service: their members for a unit admin, the recorded
        // total (which includes since-archived members) for org-wide callers.
        const headcount = (record: Doc<"attendance">) =>
            scopedIds ? (presentByRecord.get(record._id)?.size ?? 0) : record.count;

        const activeMembers = members.filter(m => m.status === 'active');
        const inactiveMembers = members.filter(m => m.status === 'inactive');
        const visitors = members.filter(m => m.status === 'visitor');

        const thirtyDaysAgoStr = formatDate(thirtyDaysAgo);
        const attendedRecently = new Set<Id<"members">>();
        const memberLastAttendance = new Map<string, string>();
        for (const record of attendanceRecords) {
            for (const memberId of presentByRecord.get(record._id) ?? []) {
                if (record.date >= thirtyDaysAgoStr) attendedRecently.add(memberId);
                const existing = memberLastAttendance.get(memberId);
                if (!existing || record.date > existing) {
                    memberLastAttendance.set(memberId, record.date);
                }
            }
        }

        const attendedLast30Days = activeMembers.filter(m => attendedRecently.has(m._id)).length;

        const retentionData = [];
        for (let i = 11; i >= 0; i--) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthStr = monthStart.toISOString().substring(0, 7);

            // For a unit admin, only services their members actually joined
            // count toward the average — org services their unit has no part in
            // would otherwise drag it toward zero.
            const monthAttendances = attendanceRecords.filter(
                a => a.date.startsWith(monthStr) && (!scopedIds || headcount(a) > 0),
            );

            const uniqueAttendees = new Set(
                monthAttendances.flatMap(a => [...(presentByRecord.get(a._id) ?? [])]),
            ).size;
            const totalAttendance = monthAttendances.reduce((sum, a) => sum + headcount(a), 0);
            const avgAttendance = monthAttendances.length > 0 ? Math.round(totalAttendance / monthAttendances.length) : 0;

            retentionData.push({
                month: monthStart.toLocaleDateString('en-US', { month: 'short' }),
                uniqueAttendees,
                totalAttendance,
                avgAttendance
            });
        }

        const inactiveThreshold = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        const inactiveThresholdStr = formatDate(inactiveThreshold);

        const potentiallyInactive = activeMembers.filter(m => {
            const lastSeen = memberLastAttendance.get(m._id);
            return !lastSeen || lastSeen < inactiveThresholdStr;
        });

        // When someone joined: the join date the church recorded, else when
        // their record was created. Compared as "yyyy-mm" so a calendar date
        // is never shifted by a time zone.
        const joinMonth = (m: Doc<"members">): string | null => {
            if (m.joined_date && /^\d{4}-\d{2}/.test(m.joined_date)) return m.joined_date.slice(0, 7);
            const created = m.created_at ? Date.parse(m.created_at) : NaN;
            const at = Number.isFinite(created) ? created : m._creationTime;
            return new Date(at).toISOString().slice(0, 7);
        };
        const monthKey = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const thisMonthKey = monthKey(now);
        const lastMonthKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

        const newMembersThisMonth = members.filter(m => joinMonth(m) === thisMonthKey).length;
        const newMembersLastMonth = members.filter(m => joinMonth(m) === lastMonthKey).length;

        const genderBreakdown = {
            male: activeMembers.filter(m => m.gender === 'male').length,
            female: activeMembers.filter(m => m.gender === 'female').length,
            unspecified: activeMembers.filter(m => !m.gender).length
        };

        const ageGroups = { under18: 0, '18-30': 0, '31-50': 0, '51-70': 0, over70: 0, unspecified: 0 };
        activeMembers.forEach(m => {
            if (!m.dob) {
                ageGroups.unspecified++;
                return;
            }
            // Age in whole years, one less until this year's birthday.
            const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(m.dob);
            const birth = parts
                ? { y: Number(parts[1]), m: Number(parts[2]) - 1, d: Number(parts[3]) }
                : (() => {
                    const b = new Date(m.dob);
                    return { y: b.getFullYear(), m: b.getMonth(), d: b.getDate() };
                })();
            if (!Number.isFinite(birth.y)) {
                ageGroups.unspecified++;
                return;
            }
            const hadBirthday =
                now.getMonth() > birth.m || (now.getMonth() === birth.m && now.getDate() >= birth.d);
            const age = now.getFullYear() - birth.y - (hadBirthday ? 0 : 1);
            if (age < 18) ageGroups.under18++;
            else if (age < 31) ageGroups['18-30']++;
            else if (age < 51) ageGroups['31-50']++;
            else if (age < 71) ageGroups['51-70']++;
            else ageGroups.over70++;
        });

        // Growth compares whole months only: the last complete month against
        // the complete month three before it (the current month is still
        // filling up). No trend when either month had no gatherings.
        const lastComplete = retentionData[retentionData.length - 2];
        const compareWith = retentionData[retentionData.length - 5];
        const trend: "up" | "down" | "flat" | null =
            lastComplete && compareWith && lastComplete.avgAttendance > 0 && compareWith.avgAttendance > 0
                ? lastComplete.avgAttendance > compareWith.avgAttendance
                    ? "up"
                    : lastComplete.avgAttendance < compareWith.avgAttendance
                        ? "down"
                        : "flat"
                : null;
        const trendingUp = trend === "up";

        // The "Not seen recently" card lists ten; say how many there are, and
        // tell "never recorded" apart from "not in the last 12 months" (the
        // window read above) for the ones shown.
        const shownInactive = potentiallyInactive.slice(0, 10);
        const shownInactiveDetails = await Promise.all(
            shownInactive.map(async (m) => {
                const lastSeen = memberLastAttendance.get(m._id) ?? null;
                const everAttended = lastSeen !== null || (await ctx.db
                    .query("member_attendance")
                    .withIndex("by_member", (q) => q.eq("member_id", m._id))
                    .first()) !== null;
                return { id: m._id, name: m.name, lastSeen, everAttended, unit_names: [] as string[] };
            }),
        );

        return {
            overview: {
                totalMembers: members.length,
                activeMembers: activeMembers.length,
                inactiveMembers: inactiveMembers.length,
                visitors: visitors.length,
                newMembersThisMonth,
                newMembersLastMonth,
                attendedLast30Days,
                engagementRate: activeMembers.length > 0 ? Math.round((attendedLast30Days / activeMembers.length) * 100) : 0,
                retentionRate: retentionData.length >= 2 && retentionData[0].uniqueAttendees > 0
                    ? Math.round((retentionData[retentionData.length - 1].uniqueAttendees / retentionData[0].uniqueAttendees) * 100)
                    : 100,
                trendingUp,
                trend,
            },
            retentionData,
            potentiallyInactive: shownInactiveDetails,
            potentiallyInactiveCount: potentiallyInactive.length,
            demographics: {
                gender: genderBreakdown,
                ageGroups
            },
            scope: await describeCallerScope(ctx, memberScope),
        };
    },
});

// Archive member (soft delete): hides them from active lists/pickers while
// preserving all history. Reversible via `restore`.
export const archive = mutation({
    args: { id: v.id("members") },
    handler: async (ctx, args) => {
        const user = await requireWriteAccess(ctx);
        const managedIds = await resolveManagedMemberIds(ctx);
        const member = await ctx.db.get(args.id);
        if (!member) throw new Error("Member not found");
        if (
            !memberIdInScope(
                args.id,
                member.organization_id,
                managedIds,
                callerOrgId(ctx, user),
            )
        ) {
            throw new Error("Forbidden");
        }
        if (member.archived_at) return; // already archived

        const now = new Date().toISOString();

        await ctx.db.patch(args.id, {
            archived_at: now,
            archived_by: user?.clerk_user_id,
            app_access: false, // revoke portal/app access on archive
            updated_at: now,
        });

        if (user) {
            await ctx.runMutation(internal.audit.logEvent, {
                action: "member.archived",
                entity_type: "member",
                entity_id: args.id,
                entity_name: member.name,
                performed_by: user.clerk_user_id,
                performed_by_name: user.name || user.email || "Unknown",
                performed_by_role: user.role,
                organization_id: member.organization_id,
            });
        }
    },
});

// Restore a previously archived member. Does not re-grant app_access.
export const restore = mutation({
    args: { id: v.id("members") },
    handler: async (ctx, args) => {
        const user = await requireWriteAccess(ctx);
        const managedIds = await resolveManagedMemberIds(ctx);
        const member = await ctx.db.get(args.id);
        if (!member) throw new Error("Member not found");
        if (
            !memberIdInScope(
                args.id,
                member.organization_id,
                managedIds,
                callerOrgId(ctx, user),
            )
        ) {
            throw new Error("Forbidden");
        }
        if (!member.archived_at) return; // already active

        const now = new Date().toISOString();

        await ctx.db.patch(args.id, {
            archived_at: undefined,
            archived_by: undefined,
            updated_at: now,
        });

        if (user) {
            await ctx.runMutation(internal.audit.logEvent, {
                action: "member.restored",
                entity_type: "member",
                entity_id: args.id,
                entity_name: member.name,
                performed_by: user.clerk_user_id,
                performed_by_name: user.name || user.email || "Unknown",
                performed_by_role: user.role,
                organization_id: member.organization_id,
            });
        }
    },
});

// Permanently delete member. Only allowed once a member has been archived,
// since this cascades and destroys attendance/label/unit history.
export const remove = mutation({
    args: { id: v.id("members") },
    handler: async (ctx, args) => {
        const user = await requireWriteAccess(ctx);
        const managedIds = await resolveManagedMemberIds(ctx);
        // Get member data before deletion for audit log
        const member = await ctx.db.get(args.id);
        if (!member) throw new Error("Member not found");
        if (
            !memberIdInScope(
                args.id,
                member.organization_id,
                managedIds,
                callerOrgId(ctx, user),
            )
        ) {
            throw new Error("Forbidden");
        }
        if (!member.archived_at) {
            throw new Error("Member must be archived before it can be permanently deleted");
        }

        // Delete member unit assignments
        const existingUnits = await ctx.db
            .query("member_units")
            .withIndex("by_member", q => q.eq("member_id", args.id))
            .collect();

        await Promise.all(existingUnits.map(r => ctx.db.delete(r._id)));

        // Delete member attendance
        const attendance = await ctx.db
            .query("member_attendance")
            .withIndex("by_member", q => q.eq("member_id", args.id))
            .collect();

        await Promise.all(attendance.map(r => ctx.db.delete(r._id)));

        // Delete member labels
        const labels = await ctx.db
            .query("member_labels")
            .withIndex("by_member", q => q.eq("member_id", args.id))
            .collect();
        await Promise.all(labels.map(r => ctx.db.delete(r._id)));

        // Unlink member from invitations
        const invites = await ctx.db
            .query("invitations")
            .filter((q: any) => q.eq(q.field("member_id"), args.id))
            .collect();
        await Promise.all(invites.map(i => ctx.db.patch(i._id, { member_id: undefined })));

        // Unlink from financial transactions
        const transactions = await ctx.db
            .query("financial_transactions")
            .filter((q: any) => q.eq(q.field("member_id"), args.id))
            .collect();
        await Promise.all(transactions.map(t => ctx.db.patch(t._id, { member_id: undefined, member_name: undefined })));

        // Log audit event for member deletion
        {
            await ctx.runMutation(internal.audit.logEvent, {
                action: "member.deleted",
                entity_type: "member",
                entity_id: args.id,
                entity_name: member.name,
                performed_by: user.clerk_user_id,
                performed_by_name: user.name || user.email || "Unknown",
                performed_by_role: user.role,
                organization_id: member.organization_id,
                changes: {
                    deleted_member: {
                        name: member.name,
                        email: member.email,
                        status: member.status
                    }
                },
            });
        }

        // Delete member
        await ctx.db.delete(args.id);
    },
});
