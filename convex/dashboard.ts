
import { v } from "convex/values";
import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { isSuperAdmin, getUserSafe, normalizeOrgId } from "./auth";
import {
    describeCallerScope,
    getLinkedMember,
    resolveCountingScope,
} from "./scope";
import { getUnitIdsAdministeredBy } from "./unit_admins";
import { eventTypeIdsForValue } from "./event_types";
import { tenureStart } from "./lib/tenure";
import { dayLabel, percentChange, recentWeekStarts, resolveToday, weekStart } from "./lib/weeks";

export const getDashboardData = query({
    args: {
        // Narrows every figure below to the members of this unit. Omitted means
        // "everything I oversee" — which for an org admin is the whole church
        // and for a unit admin is already their own slice.
        unit_id: v.optional(v.id("units")),
        // The viewer's local day ("yyyy-MM-dd"), so "upcoming" and "last
        // Sunday" follow their calendar rather than the server's UTC one.
        today: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getUserSafe(ctx);
        if (!user) return null; // Return null if user doesn't exist yet

        const { memberScope, countedIds } = await resolveCountingScope(ctx, args.unit_id);

        // Check if user has organization - if not, return empty data
        const userOrg = normalizeOrgId(ctx, user.organization_id);
        if (!userOrg && !isSuperAdmin(user)) {
            // User exists but no organization yet - return empty dashboard
            return {
                stats: {
                    totalMembers: 0,
                    scopedMembersCount: 0,
                    newMembersThisMonthCount: 0,
                    weeklyAttendance: 0,
                    orgWeeklyAttendance: 0,
                    lastServiceDate: null as string | null,
                    previousServiceCount: null as number | null,
                    attendanceChange: null as number | null,
                    activeUnitsCount: 0,
                    unitsScope: 'organization' as const,
                    upcomingEventsCount: 0,
                    orgUpcomingEventsCount: 0,
                    nextEventName: 'No upcoming events',
                },
                unitName: null,
                scope: { isScoped: false, unitNames: [], memberCount: null },
                upcomingEvents: [],
                birthdayMembers: [],
                financialTransactions: [],
            };
        }

        const orgId = isSuperAdmin(user) ? null : userOrg;

        const now = new Date();
        const todayStr = resolveToday(args.today, now);

        // 1. Members
        const allMembers = (orgId
            ? await ctx.db.query("members").withIndex("by_org", (q) => q.eq("organization_id", orgId)).collect()
            : await ctx.db.query("members").collect()
        ).filter((m) => !m.archived_at);
        const activeMembers = allMembers.filter((m) => m.status === 'active');

        const scopedMembers = countedIds
            ? activeMembers.filter((m) => countedIds.has(m._id))
            : activeMembers;

        // New this month by when they joined (joined_date, else created_at,
        // else when the record was made), the same rule Insights uses, so a
        // bulk import of long-standing members doesn't make them all "new".
        const thisMonth = todayStr.slice(0, 7);
        const newMembersThisMonthCount = scopedMembers.filter(
            (m) => tenureStart(m)?.slice(0, 7) === thisMonth,
        ).length;

        // 2. Attendance: the most recent Sunday service on record (on or
        //    before today) against the one before it. The card says so and
        //    shows its date, since the latest service may not be this week's.
        //    `orgWeeklyAttendance` is the same service counted church-wide,
        //    so a scoped headline can still be read against the whole.
        //    The church's Sunday service may be filed under the shared type
        //    or its own copy; both count, and another church's copy never does.
        const sundayIds = Array.from(await eventTypeIdsForValue(ctx, orgId, "sunday-service"));
        let weeklyAttendance = 0;
        let orgWeeklyAttendance = 0;
        let lastServiceDate: string | null = null;
        let previousServiceCount: number | null = null;

        if (sundayIds.length > 0) {
            const attendanceRecords = await (orgId
                ? ctx.db
                    .query("attendance")
                    .withIndex("by_org_and_date", q => q.eq("organization_id", orgId).lte("date", todayStr))
                : ctx.db
                    .query("attendance")
                    .withIndex("by_date", q => q.lte("date", todayStr)))
                .filter(q => q.or(...sundayIds.map(id => q.eq(q.field("event_type_id"), id))))
                .order("desc")
                .take(2);

            if (attendanceRecords.length > 0) {
                orgWeeklyAttendance = attendanceRecords[0].count;
                lastServiceDate = attendanceRecords[0].date;

                const countForRecord = async (aid: Id<"attendance">, orgCount: number) => {
                    if (!countedIds) return orgCount;
                    const relations = await ctx.db.query("member_attendance")
                        .withIndex("by_attendance", q => q.eq("attendance_id", aid))
                        .collect();
                    return relations.filter((r) => countedIds.has(r.member_id)).length;
                };

                weeklyAttendance = await countForRecord(attendanceRecords[0]._id, attendanceRecords[0].count);
                if (attendanceRecords.length > 1) {
                    previousServiceCount = await countForRecord(attendanceRecords[1]._id, attendanceRecords[1].count);
                }
            }
        }
        // Null when there's no earlier service (or nobody in scope at it), so
        // the card can say so instead of showing a green "+0%".
        const attendanceChange = percentChange(weeklyAttendance, previousServiceCount);

        // 3. Events. Every upcoming active event is collected and filtered
        //    first, so the counts are true totals; only the list is trimmed.
        const upcomingEventsRecords = (orgId
            ? await ctx.db
                .query("events")
                .withIndex("by_org", q => q.eq("organization_id", orgId))
                .filter(q => q.gte(q.field("date"), todayStr))
                .collect()
            : await ctx.db
                .query("events")
                .withIndex("by_date", q => q.gte("date", todayStr))
                .collect())
            .filter(e => e.active !== false)
            .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));

        const allUpcomingEvents = await Promise.all(upcomingEventsRecords.map(async (e) => {
            const type = e.event_type_id ? await ctx.db.get(e.event_type_id) : null;
            return {
                ...e,
                id: e._id,
                event_type_label: type?.label,
                event_type_color: type?.color,
                event_type_unit_ids: (type?.unit_ids ?? []) as Id<"units">[],
            };
        }));

        // Events carry no unit of their own; their event type does. Under a
        // unit filter, keep the ones that actually apply to that unit — an
        // event type restricted to other units is not this unit's diary.
        const unitUpcomingEvents = args.unit_id
            ? allUpcomingEvents.filter(e =>
                e.event_type_unit_ids.length === 0 ||
                e.event_type_unit_ids.some(id => id === args.unit_id))
            : allUpcomingEvents;
        const upcomingEvents = unitUpcomingEvents.slice(0, 10);

        // 4. Active Units
        let unitsQuery = ctx.db.query("units").filter(q => q.eq(q.field("active"), true));
        if (orgId) {
            unitsQuery = unitsQuery.filter(q => q.eq(q.field("organization_id"), orgId));
        }
        const activeUnits = await unitsQuery.collect();
        let ledUnitsCount: number | null = null;
        if (user.role === 'unit_admin' || user.role === 'division_admin' || user.role === 'sub_unit_admin') {
            const member = await getLinkedMember(ctx, user);
            if (member) {
                const adminUnitIds = await getUnitIdsAdministeredBy(ctx, member._id);
                ledUnitsCount = adminUnitIds.length;
            } else {
                ledUnitsCount = 0;
            }
        }

        // Under a unit filter the "groups" card describes that unit's own
        // branch — every active unit beneath it — rather than the org's total,
        // which the filter has nothing to do with.
        let unitsCount: number;
        let unitsScope: 'organization' | 'led' | 'sub-units';
        let unitName: string | null = null;
        if (args.unit_id) {
            const selected = activeUnits.find(u => u._id === args.unit_id)
                ?? (await ctx.db.get(args.unit_id));
            unitName = selected?.name ?? null;

            const childrenOf = new Map<string, typeof activeUnits>();
            for (const u of activeUnits) {
                if (!u.parent_unit_id) continue;
                const siblings = childrenOf.get(u.parent_unit_id) ?? [];
                siblings.push(u);
                childrenOf.set(u.parent_unit_id, siblings);
            }
            const countDescendants = (id: string): number =>
                (childrenOf.get(id) ?? []).reduce(
                    (sum, child) => sum + 1 + countDescendants(child._id),
                    0,
                );
            unitsCount = countDescendants(args.unit_id);
            unitsScope = 'sub-units';
        } else if (ledUnitsCount !== null) {
            unitsCount = ledUnitsCount;
            unitsScope = 'led';
        } else {
            unitsCount = activeUnits.length;
            unitsScope = 'organization';
        }

        // 5. Birthdays - return the active members in scope for frontend
        // filtering. A unit admin celebrates their own people; the org-wide
        // list isn't theirs to act on.
        return {
            stats: {
                totalMembers: activeMembers.length,
                scopedMembersCount: scopedMembers.length,
                newMembersThisMonthCount,
                weeklyAttendance,
                orgWeeklyAttendance,
                lastServiceDate,
                previousServiceCount,
                attendanceChange,
                activeUnitsCount: unitsCount,
                unitsScope,
                upcomingEventsCount: unitUpcomingEvents.length,
                orgUpcomingEventsCount: allUpcomingEvents.length,
                nextEventName: upcomingEvents.length > 0 ? upcomingEvents[0].title : 'No upcoming events',
            },
            unitName,
            scope: await describeCallerScope(ctx, memberScope),
            upcomingEvents,
            birthdayMembers: scopedMembers.map((m: any) => ({
                id: m._id,
                name: m.name,
                status: m.status,
                birth_month: m.birth_month || (m.dob ? new Date(m.dob).getMonth() + 1 : 0),
                birth_day: m.birth_day || (m.dob ? new Date(m.dob).getDate() : 0),
                dob: m.dob,
                avatar_url: m.avatar_url,
            })),
            financialTransactions: [],
        };
    }
});

export const getAttendanceTrends = query({
    args: {
        weeks: v.optional(v.number()),
        // Same unit filter as getDashboardData, so the chart under the cards
        // is plotting the slice the cards are counting.
        unit_id: v.optional(v.id("units")),
        // The viewer's local day ("yyyy-MM-dd"); see getDashboardData.
        today: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getUserSafe(ctx);
        if (!user) return [];
        if (!isSuperAdmin(user) && !normalizeOrgId(ctx, user.organization_id)) {
            return []; // User has no organization yet
        }

        const weeks = Math.min(Math.max(Math.round(args.weeks ?? 12), 1), 52);
        const { presenceCounts } = await resolveCountingScope(ctx, args.unit_id);
        const orgId = isSuperAdmin(user) ? null : normalizeOrgId(ctx, user.organization_id);

        // Whole Sunday-to-Saturday weeks (lib/weeks.ts), the last one being
        // the current week with today in it. Every week is returned, zero
        // when nothing was recorded, so a quiet week shows as a gap in the
        // bars rather than vanishing from the axis.
        const today = resolveToday(args.today);
        const weekStarts = recentWeekStarts(today, weeks);
        const startDateStr = weekStarts[0];

        const attendanceRecords = orgId
            ? await ctx.db
                .query("attendance")
                .withIndex("by_org_and_date", q => q.eq("organization_id", orgId).gte("date", startDateStr).lte("date", today))
                .collect()
            : await ctx.db
                .query("attendance")
                .withIndex("by_date", q => q.gte("date", startDateStr).lte("date", today))
                .collect();

        // Every service counts: this is attendance across the whole week, not
        // only Sunday's.
        const weeklyData = new Map<string, number>(weekStarts.map((w) => [w, 0]));
        for (const record of attendanceRecords) {
            const key = weekStart(record.date);
            if (!weeklyData.has(key)) continue;
            const count = presenceCounts ? (presenceCounts.get(record._id) ?? 0) : record.count;
            weeklyData.set(key, (weeklyData.get(key) ?? 0) + count);
        }

        return weekStarts.map((date) => ({
            name: dayLabel(date),
            date,
            total: weeklyData.get(date) ?? 0,
        }));
    }
});
