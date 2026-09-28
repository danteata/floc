// =============================================================================
// Daily scanner — derived triggers.
//
// Derived triggers (consecutive absences, no-attendance-for-N-days, birthdays)
// can't be pushed from a mutation because they describe *state*, not an event.
// A cron runs this daily: it fans out per org, then walks members in batches of
// 100, self-rescheduling — the same bounded-batch pattern as
// check_ins.expireSessions.
// =============================================================================

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, internalMutation } from "../_generated/server";
import { FactContext, MemberFacts, OrgFacts, StreakFacts, isDerivedTrigger } from "./catalog";
import { queueRuleActions } from "./engine";
import { isInRuleScope } from "./conditions";
import { isAutomationEnabled } from "./guardrails";
import {
    OrgAttendanceContext,
    buildMemberFacts,
    buildOrgFacts,
    computeStreak,
    loadMemberAttendedIds,
    loadOrgAttendanceContext,
    tenureStartDateFor,
} from "./facts";

/** Does an org have any enabled rule that needs the attendance-streak context? */
export function rulesNeedStreak(rules: Doc<"automation_rules">[]): boolean {
    return rules.some(
        (r) =>
            r.trigger_key === "member.consecutive_absences" ||
            r.trigger_key === "member.no_attendance_for_days",
    );
}

const MEMBER_BATCH = 100;
const ORG_BATCH = 200;

/** Cron entry: fan out a scan per active organization. */
export const run = internalMutation({
    args: {},
    handler: async (ctx) => {
        if (!(await isAutomationEnabled(ctx))) return { orgs: 0, disabled: true };

        const orgs = await ctx.db.query("organizations").take(ORG_BATCH);
        for (const org of orgs) {
            if (org.active === false) continue;
            await ctx.scheduler.runAfter(0, internal.automation.scan.scanOrg, {
                orgId: org._id,
            });
        }
        return { orgs: orgs.length };
    },
});

/** Scan one org's members in batches against its enabled derived rules. */
export const scanOrg = internalMutation({
    args: { orgId: v.id("organizations"), cursor: v.optional(v.string()) },
    handler: async (ctx, args) => {
        const rules = await ctx.db
            .query("automation_rules")
            .withIndex("by_org_and_status", (q) =>
                q.eq("organization_id", args.orgId).eq("status", "enabled"),
            )
            .collect();
        const derivedRules = rules.filter((r) => isDerivedTrigger(r.trigger_key));
        if (derivedRules.length === 0) return { done: true, scanned: 0 };

        const orgAttendance: OrgAttendanceContext | null = rulesNeedStreak(derivedRules)
            ? await loadOrgAttendanceContext(ctx, args.orgId)
            : null;
        const org = await buildOrgFacts(ctx, args.orgId);

        const page = await ctx.db
            .query("members")
            .withIndex("by_org", (q) => q.eq("organization_id", args.orgId))
            .paginate({ numItems: MEMBER_BATCH, cursor: args.cursor ?? null });

        for (const member of page.page) {
            // Archived members never trigger automations.
            if (member.archived_at) continue;
            await scanMember(ctx, { member, org, derivedRules, orgAttendance });
        }

        if (!page.isDone) {
            await ctx.scheduler.runAfter(0, internal.automation.scan.scanOrg, {
                orgId: args.orgId,
                cursor: page.continueCursor,
            });
        } else {
            await ctx.scheduler.runAfter(0, internal.automation.dispatch.drain, {});
        }

        return { done: page.isDone, scanned: page.page.length };
    },
});

async function scanMember(
    ctx: MutationCtx,
    opts: {
        member: Doc<"members">;
        org: OrgFacts;
        derivedRules: Doc<"automation_rules">[];
        orgAttendance: OrgAttendanceContext | null;
    },
) {
    const { member, org, derivedRules, orgAttendance } = opts;
    const memberFacts = await buildMemberFacts(ctx, member, org.timezone);

    // Load the member's attended set once, only if some rule needs streaks.
    let attendedIds: Set<string> | null = null;
    if (orgAttendance) attendedIds = await loadMemberAttendedIds(ctx, member._id);

    for (const rule of derivedRules) {
        // Cheap scope check first; queueRuleActions checks it again.
        if (!isInRuleScope(rule, memberFacts)) continue;
        const { matched, facts } = matchMemberAgainstDerivedRule({
            rule,
            member,
            memberFacts,
            org,
            orgAttendance,
            attendedIds,
        });
        if (!matched) continue;
        await queueRuleActions(ctx, { rule, facts, memberId: member._id, source: "scan" });
    }
}

/**
 * Decide whether a derived-trigger rule fires for a member and build the fact
 * context. Pure given preloaded inputs — shared by the scanner and the simulate
 * API so both agree exactly on trigger semantics. (The condition tree is
 * applied separately by queueRuleActions.)
 */
export function matchMemberAgainstDerivedRule(input: {
    rule: Doc<"automation_rules">;
    member: Doc<"members">;
    memberFacts: MemberFacts;
    org: OrgFacts;
    orgAttendance: OrgAttendanceContext | null;
    attendedIds: Set<string> | null;
}): { matched: boolean; facts: FactContext } {
    const { rule, member, memberFacts, org, orgAttendance, attendedIds } = input;
    const params = (rule.trigger_params || {}) as Record<string, any>;
    const memberUnitIds = new Set(memberFacts.unit_ids);

    const streakFor = (eventTypeValue?: string): StreakFacts => {
        if (!orgAttendance || !attendedIds) return { count: 0 };
        return computeStreak(orgAttendance, attendedIds, memberUnitIds, eventTypeValue, tenureStartDateFor(member));
    };

    let matched = false;
    let streak: StreakFacts | undefined;

    if (rule.trigger_key === "member.consecutive_absences") {
        const threshold = Number(params.threshold ?? 0);
        streak = streakFor(params.event_type_value);
        matched = threshold > 0 && streak.count >= threshold;
    } else if (rule.trigger_key === "member.no_attendance_for_days") {
        const days = Number(params.days ?? 0);
        streak = streakFor(undefined);
        const neverAttended = streak.last_present_date === undefined && streak.count > 0;
        matched =
            days > 0 &&
            (neverAttended || (streak.days_since_last !== undefined && streak.days_since_last >= days));
    } else if (rule.trigger_key === "member.birthday") {
        const daysBefore = Number(params.days_before ?? 0);
        matched = isBirthdayMatch(member, org.timezone, daysBefore);
    } else if (rule.trigger_key === "member.engagement_score_below") {
        // Reads the field the daily engagement recompute already wrote —
        // no attendance walk needed here, unlike the streak-based triggers.
        const threshold = Number(params.threshold ?? 0);
        matched =
            threshold > 0 &&
            memberFacts.engagement_score !== undefined &&
            memberFacts.engagement_score < threshold;
    }

    return { matched, facts: { org, member: memberFacts, streak } };
}

// ---------------------------------------------------------------------------
// Birthday matching (timezone-aware)
// ---------------------------------------------------------------------------

/** Month (1-12) and day-of-month for "now + offsetDays" in the given IANA tz. */
function localMonthDay(timezone: string | undefined, offsetDays: number): { month: number; day: number } {
    const target = new Date(Date.now() + offsetDays * 24 * 3600 * 1000);
    try {
        const fmt = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone || "UTC",
            month: "numeric",
            day: "numeric",
        });
        const parts = fmt.formatToParts(target);
        const month = Number(parts.find((p) => p.type === "month")?.value);
        const day = Number(parts.find((p) => p.type === "day")?.value);
        return { month, day };
    } catch {
        return { month: target.getUTCMonth() + 1, day: target.getUTCDate() };
    }
}

function memberBirthMonthDay(member: Doc<"members">): { month: number; day: number } | null {
    if (member.birth_month && member.birth_day) {
        return { month: member.birth_month, day: member.birth_day };
    }
    if (member.dob) {
        const m = member.dob.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return { month: Number(m[2]), day: Number(m[3]) };
    }
    return null;
}

function isBirthdayMatch(member: Doc<"members">, timezone: string | undefined, daysBefore: number): boolean {
    const bd = memberBirthMonthDay(member);
    if (!bd) return false;
    const target = localMonthDay(timezone, daysBefore);
    return target.month === bd.month && target.day === bd.day;
}
