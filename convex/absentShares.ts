import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireOrgAdmin, requireOrgAccess, resolveOrgId } from "./auth";
import { publicBrandHex } from "./lib/theme/publicBrand";
import { tenureStart } from "./lib/tenure";

const DEFAULT_EXPIRY_DAYS = 30;

/** The attendance screens' default: inactive members are absent from every service by definition. */
const DEFAULT_STATUSES = ["active", "visitor"];

/** The church's own event type first, then a shared default with the same value. */
async function findEventType(ctx: QueryCtx, orgId: Id<"organizations">, value: string) {
    const own = await ctx.db
        .query("event_types")
        .withIndex("by_org_and_value", (q) => q.eq("organization_id", orgId).eq("value", value))
        .first();
    if (own) return own;
    const shared = await ctx.db
        .query("event_types")
        .withIndex("by_value", (q) => q.eq("value", value))
        .collect();
    return shared.find((t) => !t.organization_id) ?? null;
}

export const create = mutation({
    args: {
        organization_id: v.optional(v.id("organizations")),
        event_type: v.string(),
        date: v.string(),
        expires_in_days: v.optional(v.number()),
        unit_id: v.optional(v.id("units")),
        statuses: v.optional(v.array(v.string())),
        min_consecutive: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const admin = await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) throw new Error("Organization context required");
        if (args.unit_id) {
            const unit = await ctx.db.get(args.unit_id);
            if (!unit || unit.organization_id !== orgId) throw new Error("Unit not found");
        }

        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

        const expiresInDays = args.expires_in_days ?? DEFAULT_EXPIRY_DAYS;

        const shareId = await ctx.db.insert("absent_member_shares", {
            organization_id: orgId,
            event_type_value: args.event_type,
            date: args.date,
            token,
            created_by: admin.clerk_user_id,
            expires_at: expiresInDays > 0 ? Date.now() + expiresInDays * 24 * 60 * 60 * 1000 : undefined,
            revoked: false,
            unit_id: args.unit_id,
            statuses: args.statuses && args.statuses.length > 0 ? args.statuses : undefined,
            min_consecutive: args.min_consecutive && args.min_consecutive > 0 ? args.min_consecutive : undefined,
        });

        return { shareId, token };
    },
});

export const listActive = query({
    args: {
        organization_id: v.optional(v.id("organizations")),
        event_type: v.string(),
        date: v.string(),
    },
    handler: async (ctx, args) => {
        await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) return [];

        const shares = await ctx.db
            .query("absent_member_shares")
            .withIndex("by_org_event_date", (q) =>
                q.eq("organization_id", orgId).eq("event_type_value", args.event_type).eq("date", args.date)
            )
            .collect();

        const now = Date.now();
        const active = shares.filter((s) => !s.revoked && (!s.expires_at || s.expires_at > now));
        return Promise.all(
            active.map(async (share) => ({
                ...share,
                unit_name: share.unit_id ? (await ctx.db.get(share.unit_id))?.name ?? null : null,
                statuses: share.statuses ?? DEFAULT_STATUSES,
            })),
        );
    },
});

export const revoke = mutation({
    args: { id: v.id("absent_member_shares") },
    handler: async (ctx, args) => {
        const share = await ctx.db.get(args.id);
        if (!share) throw new Error("Share link not found");
        await requireOrgAccess(ctx, share.organization_id);
        await ctx.db.patch(args.id, { revoked: true });
    },
});

// Public, unauthenticated: returns only the minimal fields needed for follow-up.
export const getByToken = query({
    args: { token: v.string() },
    handler: async (ctx, args) => {
        const share = await ctx.db
            .query("absent_member_shares")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .unique();

        if (!share) return null;
        if (share.revoked) return null;
        if (share.expires_at && share.expires_at < Date.now()) return null;

        const organization = await ctx.db.get(share.organization_id);
        const eventType = await findEventType(ctx, share.organization_id, share.event_type_value);
        const statuses = share.statuses ?? DEFAULT_STATUSES;
        const unit = share.unit_id ? await ctx.db.get(share.unit_id) : null;
        const scope = {
            unit_name: unit?.name ?? null,
            statuses,
            min_consecutive: share.min_consecutive ?? null,
        };

        const orgAttendance = await ctx.db
            .query("attendance")
            .withIndex("by_org", (q) => q.eq("organization_id", share.organization_id))
            .collect();

        const matchingRecord = orgAttendance.find(
            (record) => record.date === share.date && record.event_type_id === eventType?._id
        );

        if (!matchingRecord) {
            return {
                organization_name: organization?.name ?? "",
                brand_hex: await publicBrandHex(ctx, share.organization_id, organization),
                event_type_label: eventType?.label ?? share.event_type_value,
                date: share.date,
                scope,
                attendance_taken: false,
                units: [],
                members: [],
            };
        }

        const attendedMemberIds = new Set(
            (
                await ctx.db
                    .query("member_attendance")
                    .withIndex("by_attendance", (q) => q.eq("attendance_id", matchingRecord._id))
                    .collect()
            ).map((ma) => ma.member_id)
        );

        // All attendance records for this event type, used to walk back consecutive absences.
        const eventTypeRecords = orgAttendance
            .filter((record) => record.event_type_id === eventType?._id)
            .sort((a, b) => a.date.localeCompare(b.date));

        const eventTypeMemberAttendance = await Promise.all(
            eventTypeRecords.map((record) =>
                ctx.db
                    .query("member_attendance")
                    .withIndex("by_attendance", (q) => q.eq("attendance_id", record._id))
                    .collect()
            )
        );

        const attendedDatesByMember = new Map<Id<"members">, Set<string>>();
        eventTypeRecords.forEach((record, i) => {
            for (const ma of eventTypeMemberAttendance[i]) {
                const set = attendedDatesByMember.get(ma.member_id) ?? new Set<string>();
                set.add(record.date);
                attendedDatesByMember.set(ma.member_id, set);
            }
        });

        // Real recorded sessions for this event type on/before the share date, most-recent
        // first. Consecutive absences are counted against sessions that actually happened,
        // not assumed calendar weeks — a session may not run on a perfectly regular
        // weekly cadence (skipped weeks, shifted dates), so date arithmetic would
        // overcount whenever the real cadence doesn't match.
        const eventTypeRecordsOnOrBefore = eventTypeRecords
            .filter((record) => record.date <= share.date)
            .sort((a, b) => b.date.localeCompare(a.date));

        const calculateConsecutiveAbsences = (memberId: Id<"members">, since: string | null) => {
            const attendedDates = attendedDatesByMember.get(memberId);

            let consecutiveAbsences = 0;
            for (const record of eventTypeRecordsOnOrBefore) {
                // Services held before they joined don't count against them.
                if (since && record.date < since) break;
                if (attendedDates?.has(record.date)) break;
                consecutiveAbsences++;
            }
            return consecutiveAbsences;
        };

        const orgMembers = await ctx.db
            .query("members")
            .withIndex("by_org", (q) => q.eq("organization_id", share.organization_id))
            .collect();

        // The same rules as the Absent tab: members the event applies to (its
        // unit scope), in the chosen unit, with the chosen statuses.
        const eventUnitIds = new Set((eventType?.unit_ids ?? []).map(String));
        const unitSet = new Set<string>();
        const candidates = await Promise.all(
            orgMembers
                .filter(
                    (member) =>
                        !attendedMemberIds.has(member._id) &&
                        !member.archived_at &&
                        statuses.includes(member.status) &&
                        // Not yet a member on the day: not absent.
                        !((tenureStart(member) ?? "") > share.date),
                )
                .map(async (member) => {
                    const memberUnits = await ctx.db
                        .query("member_units")
                        .withIndex("by_member", (q) => q.eq("member_id", member._id))
                        .collect();
                    const unitIds = memberUnits.map((mu) => String(mu.unit_id));
                    if (eventUnitIds.size > 0 && !unitIds.some((id) => eventUnitIds.has(id))) return null;
                    if (share.unit_id && !unitIds.includes(String(share.unit_id))) return null;
                    const consecutive = calculateConsecutiveAbsences(member._id, tenureStart(member));
                    if (share.min_consecutive && consecutive < share.min_consecutive) return null;

                    const unitNames = (
                        await Promise.all(memberUnits.map((mu) => ctx.db.get(mu.unit_id)))
                    )
                        .filter((unit): unit is NonNullable<typeof unit> => unit !== null)
                        .map((unit) => unit.name);

                    unitNames.forEach((name) => unitSet.add(name));

                    return {
                        id: member._id,
                        name: member.name,
                        phone: member.phone ?? "",
                        unit_names: unitNames,
                        consecutive_absences: consecutive,
                    };
                })
        );
        // Longest absence first: the people to call before anyone else.
        const members = candidates
            .filter((m): m is NonNullable<typeof m> => m !== null)
            .sort((a, b) => b.consecutive_absences - a.consecutive_absences || a.name.localeCompare(b.name));

        return {
            organization_name: organization?.name ?? "",
            brand_hex: await publicBrandHex(ctx, share.organization_id, organization),
            event_type_label: eventType?.label ?? share.event_type_value,
            date: share.date,
            scope,
            attendance_taken: true,
            units: Array.from(unitSet).sort(),
            members,
        };
    },
});
