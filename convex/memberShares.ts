import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireUser, requireOrgAccess, resolveOrgId, isOrgAdmin } from "./auth";
import { memberFilterArgs, resolveFilteredMembers } from "./members";
import { internal } from "./_generated/api";
import { isFlagEnabled, requireFlag } from "./lib/flags/server";
import { publicBrandHex } from "./lib/theme/publicBrand";

const DEFAULT_EXPIRY_DAYS = 30;

// A share link freezes the matching member ids, so it has to stay inside a
// document. Cap it well below the 1MB limit (an id is ~32 bytes) and tell the
// creator when their list was cut short rather than silently shipping a
// partial phone list.
const MAX_SHARED_MEMBERS = 2000;

/**
 * Optional columns a share link may expose. `name` is always included and is
 * deliberately absent here. Anything not in this list is dropped at creation
 * time, and the public reader only ever projects the stored columns — an
 * unselected field never leaves the backend.
 */
export const MEMBER_SHARE_COLUMNS = [
    "phone",
    "email",
    "status",
    "units",
    "household",
    "address",
    "gender",
    "joined_date",
] as const;

type ShareColumn = (typeof MEMBER_SHARE_COLUMNS)[number];

const isShareColumn = (value: string): value is ShareColumn =>
    (MEMBER_SHARE_COLUMNS as readonly string[]).includes(value);

export const create = mutation({
    args: {
        ...memberFilterArgs,
        title: v.optional(v.string()),
        description: v.optional(v.string()),
        columns: v.array(v.string()),
        // When the admin has rows checked, share exactly those. Always
        // intersected with the filtered result the caller is allowed to see,
        // so a hand-crafted id list can't reach outside their scope.
        member_ids: v.optional(v.array(v.id("members"))),
        expires_in_days: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) throw new Error("Organization context required");

        // Both gates, because they answer different questions: the release flag
        // is whether this org has the feature, the kill switch is whether the
        // deployment is currently willing to serve public links at all.
        await requireFlag(ctx, "release.member_list_share", orgId);
        await requireFlag(
            ctx,
            "kill.public_shares",
            orgId,
            "Public share links are temporarily switched off. Export the list instead, or try again later.",
        );

        const { title, description, columns, member_ids, expires_in_days, ...filters } = args;

        let members = await resolveFilteredMembers(ctx, { ...filters, organization_id: orgId });
        if (member_ids && member_ids.length > 0) {
            const picked = new Set<string>(member_ids);
            members = members.filter((m) => picked.has(m._id));
        }
        if (members.length === 0) throw new Error("There are no members to share");

        const truncated = members.length > MAX_SHARED_MEMBERS;
        const sharedMembers = members.slice(0, MAX_SHARED_MEMBERS);

        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

        const expiresInDays = expires_in_days ?? DEFAULT_EXPIRY_DAYS;

        const shareId = await ctx.db.insert("member_list_shares", {
            organization_id: orgId,
            token,
            title: title?.trim() || "Members",
            description: description?.trim() || undefined,
            member_ids: sharedMembers.map((m) => m._id),
            columns: columns.filter(isShareColumn),
            created_by: user.clerk_user_id,
            created_by_name: user.name,
            expires_at: expiresInDays > 0 ? Date.now() + expiresInDays * 24 * 60 * 60 * 1000 : undefined,
            revoked: false,
        });

        // Publishing contact details behind a public link is worth a trail.
        await ctx.runMutation(internal.audit.logEvent, {
            action: "member_list_share.created",
            entity_type: "member_list_share",
            entity_id: shareId,
            entity_name: title?.trim() || "Members",
            performed_by: user._id,
            performed_by_name: user.name || "Unknown",
            performed_by_role: user.role,
            organization_id: orgId,
            metadata: {
                member_count: sharedMembers.length,
                columns: columns.filter(isShareColumn),
                filters: description?.trim() || undefined,
                expires_in_days: expiresInDays,
            },
        });

        return { shareId, token, count: sharedMembers.length, truncated, limit: MAX_SHARED_MEMBERS };
    },
});

/**
 * Live share links for the current org. Org admins see every link so they can
 * revoke one they didn't create; everyone else sees only their own — a unit
 * leader shouldn't be handed an org-wide link through the management list.
 */
export const listActive = query({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) return [];

        const shares = await ctx.db
            .query("member_list_shares")
            .withIndex("by_org", (q) => q.eq("organization_id", orgId))
            .order("desc")
            .take(100);

        const now = Date.now();
        const seesAll = isOrgAdmin(user);
        return shares
            .filter((s) => !s.revoked && (!s.expires_at || s.expires_at > now))
            .filter((s) => seesAll || s.created_by === user.clerk_user_id)
            .map((s) => ({
                _id: s._id,
                token: s.token,
                title: s.title,
                description: s.description,
                member_count: s.member_ids.length,
                created_by_name: s.created_by_name,
                expires_at: s.expires_at,
                created_at: s._creationTime,
            }));
    },
});

export const revoke = mutation({
    args: { id: v.id("member_list_shares") },
    handler: async (ctx, args) => {
        const share = await ctx.db.get(args.id);
        if (!share) throw new Error("Share link not found");
        const user = await requireOrgAccess(ctx, share.organization_id);
        if (!isOrgAdmin(user) && share.created_by !== user.clerk_user_id) {
            throw new Error("Forbidden");
        }
        await ctx.db.patch(args.id, { revoked: true });

        await ctx.runMutation(internal.audit.logEvent, {
            action: "member_list_share.revoked",
            entity_type: "member_list_share",
            entity_id: args.id,
            entity_name: share.title,
            performed_by: user._id,
            performed_by_name: user.name || "Unknown",
            performed_by_role: user.role,
            organization_id: share.organization_id,
        });
    },
});

// Public, unauthenticated: projects only the columns the link was created
// with, so a field the admin left unchecked is never sent to the browser.
export const getByToken = query({
    args: { token: v.string() },
    handler: async (ctx, args) => {
        const share = await ctx.db
            .query("member_list_shares")
            .withIndex("by_token", (q) => q.eq("token", args.token))
            .unique();

        if (!share) return null;
        if (share.revoked) return null;
        if (share.expires_at && share.expires_at < Date.now()) return null;

        // The kill switch withdraws every link at once. Reported to the viewer
        // through the same "this link is unavailable" path as a revoked one,
        // which is what has effectively happened to it — and a page that said
        // "temporarily off" would tell whoever the link leaked to that it is
        // worth trying again tomorrow.
        if (!(await isFlagEnabled(ctx, "kill.public_shares"))) return null;

        const columns = share.columns.filter(isShareColumn);
        const wants = (column: ShareColumn) => columns.includes(column);

        const organization = await ctx.db.get(share.organization_id);
        const docs = (
            await Promise.all(share.member_ids.map((id) => ctx.db.get(id)))
        ).filter((m): m is Doc<"members"> => m !== null);

        const unitSet = new Set<string>();
        const members = await Promise.all(
            docs.map(async (member) => {
                let unitNames: string[] = [];
                if (wants("units")) {
                    const memberUnits = await ctx.db
                        .query("member_units")
                        .withIndex("by_member", (q) => q.eq("member_id", member._id))
                        .collect();
                    unitNames = (await Promise.all(memberUnits.map((mu) => ctx.db.get(mu.unit_id))))
                        .filter((unit): unit is Doc<"units"> => unit !== null)
                        .map((unit) => unit.name);
                    unitNames.forEach((name) => unitSet.add(name));
                }

                let householdName: string | undefined;
                if (wants("household") && member.household_id) {
                    const household = await ctx.db.get(member.household_id as Id<"households">);
                    householdName = household?.name || undefined;
                }

                const address = [member.address, member.city, member.state]
                    .filter(Boolean)
                    .join(", ");

                return {
                    id: member._id,
                    name: member.name,
                    phone: wants("phone") ? (member.phone ?? "") : undefined,
                    email: wants("email") ? (member.email ?? "") : undefined,
                    status: wants("status") ? member.status : undefined,
                    unit_names: wants("units") ? unitNames : undefined,
                    household_name: wants("household") ? householdName : undefined,
                    address: wants("address") ? address : undefined,
                    gender: wants("gender") ? (member.gender ?? "") : undefined,
                    joined_date: wants("joined_date") ? (member.joined_date ?? "") : undefined,
                };
            }),
        );

        members.sort((a, b) => a.name.localeCompare(b.name));

        return {
            organization_name: organization?.name ?? "",
            brand_hex: await publicBrandHex(ctx, share.organization_id, organization),
            title: share.title,
            description: share.description,
            columns,
            units: Array.from(unitSet).sort(),
            members,
        };
    },
});
