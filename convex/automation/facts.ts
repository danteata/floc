// =============================================================================
// Fact-context builders
//
// Turns DB documents into the FactContext the evaluator/templating consume.
// The attendance-streak logic here is the shared source of truth extracted from
// attendance.getMemberSummary (attendance.ts:665) so scan-time and read-time
// agree on what "consecutive absences" means.
// =============================================================================

import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { MemberFacts, OrgFacts, StreakFacts } from "./catalog";

type Ctx = MutationCtx | QueryCtx;

// ---------------------------------------------------------------------------
// Contact helpers
// ---------------------------------------------------------------------------

/** A usable SMS destination: present, digit-bearing, and not a placeholder. */
export function isRealPhone(phone?: string | null): boolean {
    if (!phone) return false;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) return false;
    if (/^0+$/.test(digits)) return false; // "0000000000" placeholder used elsewhere
    return true;
}

export function isRealEmail(email?: string | null): boolean {
    if (!email) return false;
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
}

function firstName(name: string): string {
    return name.trim().split(/\s+/)[0] || name;
}

function computeAge(member: Doc<"members">): number | undefined {
    // Prefer full dob; fall back to birth_month/day (no year → no age).
    if (member.dob) {
        const d = new Date(member.dob);
        if (!isNaN(d.getTime())) {
            const now = new Date();
            let age = now.getUTCFullYear() - d.getUTCFullYear();
            const m = now.getUTCMonth() - d.getUTCMonth();
            if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
            if (age >= 0 && age < 150) return age;
        }
    }
    return undefined;
}

function computeYearsAsMember(member: Doc<"members">): number | undefined {
    if (!member.joined_date) return undefined;
    const d = new Date(member.joined_date);
    if (isNaN(d.getTime())) return undefined;
    const years = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    return years >= 0 ? Math.floor(years) : undefined;
}

// ---------------------------------------------------------------------------
// Member facts
// ---------------------------------------------------------------------------

export async function buildMemberFacts(ctx: Ctx, member: Doc<"members">): Promise<MemberFacts> {
    const memberUnits = await ctx.db
        .query("member_units")
        .withIndex("by_member", (q) => q.eq("member_id", member._id))
        .collect();
    const memberLabels = await ctx.db
        .query("member_labels")
        .withIndex("by_member", (q) => q.eq("member_id", member._id))
        .collect();

    return {
        id: member._id,
        name: member.name,
        first_name: firstName(member.name),
        status: member.status,
        gender: member.gender,
        email: member.email,
        phone: member.phone,
        has_sms: isRealPhone(member.phone),
        has_email: isRealEmail(member.email),
        unit_ids: memberUnits.map((mu) => mu.unit_id as string),
        label_ids: memberLabels.map((ml) => ml.label_id as string),
        age: computeAge(member),
        years_as_member: computeYearsAsMember(member),
        engagement_score: member.engagement_score,
        engagement_risk_level: member.engagement_risk_level,
        archived: !!member.archived_at,
    };
}

export async function buildOrgFacts(ctx: Ctx, orgId: Id<"organizations">): Promise<OrgFacts> {
    const org = await ctx.db.get(orgId);
    return {
        id: orgId,
        name: org?.name || "our church",
        timezone: org?.timezone,
    };
}

// ---------------------------------------------------------------------------
// Attendance streak
//
// Loading the org's recent attendance + resolving event types is expensive, so
// the scanner loads it ONCE per org (loadOrgAttendanceContext) and reuses it
// across every member in that org via the pure computeStreak().
// ---------------------------------------------------------------------------

export type OrgAttendanceRecord = {
    id: Id<"attendance">;
    date: string;
    event_type_value?: string;
    unit_ids: string[]; // event-type unit scoping; [] = applies to all
};

export type OrgAttendanceContext = {
    records: OrgAttendanceRecord[]; // newest first
};

/** Load the org's most recent attendance headers with event-type scoping resolved. */
export async function loadOrgAttendanceContext(
    ctx: Ctx,
    orgId: Id<"organizations">,
    limit = 100,
): Promise<OrgAttendanceContext> {
    const attendance = await ctx.db
        .query("attendance")
        .withIndex("by_org_and_date", (q) => q.eq("organization_id", orgId))
        .order("desc")
        .take(limit);

    // Resolve each distinct event type once.
    const eventTypeCache = new Map<string, { value?: string; unit_ids: string[] }>();
    const records: OrgAttendanceRecord[] = [];
    for (const a of attendance) {
        let value: string | undefined;
        let unitIds: string[] = [];
        if (a.event_type_id) {
            const key = a.event_type_id as string;
            let resolved = eventTypeCache.get(key);
            if (!resolved) {
                const et = await ctx.db.get(a.event_type_id);
                resolved = {
                    value: (et as any)?.value,
                    unit_ids: ((et as any)?.unit_ids || []) as string[],
                };
                eventTypeCache.set(key, resolved);
            }
            value = resolved.value;
            unitIds = resolved.unit_ids;
        }
        records.push({ id: a._id, date: a.date, event_type_value: value, unit_ids: unitIds });
    }

    return { records };
}

/** Set of attendance_ids a member is marked present for. */
export async function loadMemberAttendedIds(
    ctx: Ctx,
    memberId: Id<"members">,
): Promise<Set<string>> {
    const rows = await ctx.db
        .query("member_attendance")
        .withIndex("by_member", (q) => q.eq("member_id", memberId))
        .collect();
    return new Set(rows.map((r) => r.attendance_id as string));
}

/**
 * A member's tenure-start date ("YYYY-MM-DD"), for bounding attendance
 * lookback so a recently-added member isn't penalized for services that
 * happened before they joined. Falls through joined_date -> created_at ->
 * _creationTime — the same chain attendance.getMemberSummary and
 * engagement/scoring.ts's tenureDays each use.
 */
export function tenureStartDateFor(member: Doc<"members">): string {
    return (
        member.joined_date ||
        member.created_at?.slice(0, 10) ||
        new Date(member._creationTime).toISOString().slice(0, 10)
    );
}

/**
 * Filter org attendance records to those applicable to a member: unit-scoped
 * (an event type with no unit_ids applies to everyone), optionally to a
 * single event_type_value, and never before the member's own tenure start.
 * Shared by computeStreak and the engagement-score window helpers below, so
 * every attendance-derived signal agrees on scoping.
 */
function applicableAttendanceRecords(
    orgAttendance: OrgAttendanceContext,
    memberUnitIds: Set<string>,
    eventTypeValue?: string,
    tenureStartDate?: string,
): OrgAttendanceRecord[] {
    return orgAttendance.records.filter((r) => {
        if (tenureStartDate && r.date < tenureStartDate) return false;
        if (eventTypeValue && r.event_type_value !== eventTypeValue) return false;
        if (r.unit_ids.length === 0) return true; // applies to all
        return r.unit_ids.some((u) => memberUnitIds.has(u));
    });
}

/**
 * Pure streak computation. Mirrors attendance.getMemberSummary:665.
 * - Filters org records to those applicable to the member (unit scoping,
 *   tenure start) and, optionally, to a specific event_type_value.
 * - Sorts by date desc; consecutive absences = leading run of "absent".
 */
export function computeStreak(
    orgAttendance: OrgAttendanceContext,
    attendedIds: Set<string>,
    memberUnitIds: Set<string>,
    eventTypeValue?: string,
    tenureStartDate?: string,
): StreakFacts {
    const applicable = applicableAttendanceRecords(orgAttendance, memberUnitIds, eventTypeValue, tenureStartDate);

    // Records are already newest-first from the index; keep that order.
    const sorted = [...applicable].sort((a, b) => b.date.localeCompare(a.date));

    let count = 0;
    let lastPresentDate: string | undefined;
    for (const rec of sorted) {
        const present = attendedIds.has(rec.id as string);
        if (present) {
            lastPresentDate = rec.date;
            break;
        }
        count++;
    }

    let daysSinceLast: number | undefined;
    if (lastPresentDate) {
        const d = new Date(lastPresentDate);
        if (!isNaN(d.getTime())) {
            daysSinceLast = Math.max(0, Math.floor((Date.now() - d.getTime()) / (24 * 3600 * 1000)));
        }
    }

    return { count, last_present_date: lastPresentDate, days_since_last: daysSinceLast };
}

export type AttendanceWindowCounts = {
    attended: number; // applicable services attended within the window
    applicable: number; // applicable services that occurred within the window
};

/**
 * Count applicable-services-attended vs. applicable-services-that-happened
 * within a trailing window ending `endDaysAgo` days ago. Used by engagement
 * scoring for both a rate ("consistency": attended/applicable over ~12 weeks)
 * and a trend (comparing two consecutive windows) without re-deriving the
 * unit-scoping logic computeStreak already has.
 */
export function computeAttendanceWindowCounts(
    orgAttendance: OrgAttendanceContext,
    attendedIds: Set<string>,
    memberUnitIds: Set<string>,
    windowDays: number,
    endDaysAgo: number = 0,
    eventTypeValue?: string,
    tenureStartDate?: string,
): AttendanceWindowCounts {
    const applicableRecords = applicableAttendanceRecords(orgAttendance, memberUnitIds, eventTypeValue, tenureStartDate);
    const now = Date.now();
    const windowEnd = now - endDaysAgo * 24 * 3600 * 1000;
    const windowStart = windowEnd - windowDays * 24 * 3600 * 1000;

    let attended = 0;
    let applicable = 0;
    for (const rec of applicableRecords) {
        const t = new Date(rec.date).getTime();
        if (isNaN(t) || t < windowStart || t > windowEnd) continue;
        applicable++;
        if (attendedIds.has(rec.id as string)) attended++;
    }
    return { attended, applicable };
}

/** Convenience: compute a single member's streak by loading everything (event path). */
export async function computeMemberStreak(
    ctx: Ctx,
    member: Doc<"members">,
    eventTypeValue?: string,
): Promise<StreakFacts> {
    if (!member.organization_id) return { count: 0 };
    const orgAttendance = await loadOrgAttendanceContext(ctx, member.organization_id);
    const attendedIds = await loadMemberAttendedIds(ctx, member._id);
    const memberUnits = await ctx.db
        .query("member_units")
        .withIndex("by_member", (q) => q.eq("member_id", member._id))
        .collect();
    const memberUnitIds = new Set(memberUnits.map((mu) => mu.unit_id as string));
    return computeStreak(orgAttendance, attendedIds, memberUnitIds, eventTypeValue, tenureStartDateFor(member));
}
