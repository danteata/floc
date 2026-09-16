import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireOrgAdmin, requireOrgAccess, resolveOrgId } from "./auth";
import { publicBrandHex } from "./lib/theme/publicBrand";

const DEFAULT_EXPIRY_DAYS = 30;

export const create = mutation({
    args: {
        organization_id: v.optional(v.id("organizations")),
        event_type: v.string(),
        date: v.string(),
        expires_in_days: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const admin = await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) throw new Error("Organization context required");

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
        return shares.filter((s) => !s.revoked && (!s.expires_at || s.expires_at > now));
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
        const eventType = await ctx.db
            .query("event_types")
            .withIndex("by_value", (q) => q.eq("value", share.event_type_value))
            .unique();

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

        const calculateConsecutiveAbsences = (memberId: Id<"members">) => {
            const attendedDates = attendedDatesByMember.get(memberId);

            let consecutiveAbsences = 0;
            for (const record of eventTypeRecordsOnOrBefore) {
                if (attendedDates?.has(record.date)) break;
                consecutiveAbsences++;
            }
            return consecutiveAbsences;
        };

        const orgMembers = await ctx.db
            .query("members")
            .withIndex("by_org", (q) => q.eq("organization_id", share.organization_id))
            .collect();

        const unitSet = new Set<string>();
        const members = await Promise.all(
            orgMembers
                .filter((member) => !attendedMemberIds.has(member._id) && !member.archived_at)
                .map(async (member) => {
                    const memberUnits = await ctx.db
                        .query("member_units")
                        .withIndex("by_member", (q) => q.eq("member_id", member._id))
                        .collect();

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
                        consecutive_absences: calculateConsecutiveAbsences(member._id),
                    };
                })
        );

        return {
            organization_name: organization?.name ?? "",
            brand_hex: await publicBrandHex(ctx, share.organization_id, organization),
            event_type_label: eventType?.label ?? share.event_type_value,
            date: share.date,
            units: Array.from(unitSet).sort(),
            members,
        };
    },
});
