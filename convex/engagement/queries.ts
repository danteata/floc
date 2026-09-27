// =============================================================================
// Engagement score reads (public API).
//
// Score computation itself lives in scoring.ts / recompute.ts — this file is
// just the query surface the dashboard widget and member views read from.
// =============================================================================

import { v } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { isSuperAdmin, requireUser, resolveOrgId } from "../auth";
import {
    callerOrgId,
    isOrgWideScope,
    memberIdInScope,
    resolveManagedMemberIds,
    unitMemberIds,
} from "../scope";
import {
    impactLevel,
    impactScore,
    parseBreakdown,
    queueReasons,
    recoveryOutcome,
    wasAtRisk,
} from "./impact";

// engagement/scoring.ts riskLevelFor: 70 and above is "low" risk.
const AT_RISK_BELOW = 70;

/**
 * Members at risk (high or medium risk level) for the org or the caller's
 * managed scope, lowest score first, for the "members at risk" dashboard
 * widget. Reads whatever the daily recompute last wrote — Free orgs simply
 * have no scored members, so this returns an empty list.
 *
 * `total` is every at-risk member in scope; `members` is the first `limit`
 * of them, so the widget can say "12 members at risk, showing 5".
 */
const atRiskArgs = {
    organization_id: v.optional(v.id("organizations")),
    limit: v.optional(v.number()),
    // The dashboard's unit filter: only this unit's members.
    unit_id: v.optional(v.id("units")),
};

/** Members at medium or high risk, with the true total before the list is cut short. */
export const listAtRiskSummary = query({
    args: atRiskArgs,
    handler: (ctx, args) => atRiskSummary(ctx, args),
});

/** The list alone, for clients built before listAtRiskSummary. Remove once they're gone. */
export const listAtRisk = query({
    args: atRiskArgs,
    handler: async (ctx, args) => (await atRiskSummary(ctx, args)).members,
});

async function atRiskSummary(
    ctx: QueryCtx,
    args: { organization_id?: Id<"organizations">; limit?: number; unit_id?: Id<"units"> },
) {
    {
        const empty = { total: 0, members: [] };
        const user = await requireUser(ctx);
        const orgId = isSuperAdmin(user)
            ? args.organization_id
            : await resolveOrgId(ctx, args.organization_id);
        if (!orgId) return empty;

        const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
        const scope = await resolveManagedMemberIds(ctx);
        const unitIds = args.unit_id ? await unitMemberIds(ctx, args.unit_id) : null;

        // Risk levels come from the score (engagement/scoring.ts: under 70 is
        // medium or high), so the at-risk pool is the index range below 70.
        // Range on the trailing index field also excludes docs where
        // engagement_score is undefined (Free orgs, or not yet computed).
        // "new" members can score low too, but aren't at risk; the level
        // check drops them.
        const candidates = await ctx.db
            .query("members")
            .withIndex("by_org_and_engagement_score", (q) =>
                q.eq("organization_id", orgId).gte("engagement_score", 0).lt("engagement_score", AT_RISK_BELOW),
            )
            .order("asc")
            .collect();

        const atRisk = candidates.filter(
            (m) =>
                !m.archived_at &&
                (m.engagement_risk_level === "high" || m.engagement_risk_level === "medium") &&
                (isOrgWideScope(scope) || scope.has(m._id)) &&
                (!unitIds || unitIds.has(m._id)),
        );

        return {
            total: atRisk.length,
            members: atRisk.slice(0, limit).map((m) => ({
                id: m._id,
                name: m.name,
                avatar_url: m.avatar_url,
                engagement_score: m.engagement_score,
                engagement_risk_level: m.engagement_risk_level,
                household_id: m.household_id,
            })),
        };
    }
}

// Statuses that mean a member is already being followed up on (so they should
// not resurface in the "who to call next" queue).
const OPEN_TASK_STATUSES = ["pending", "contacted"] as const;

/**
 * Impact-ranked care queue: at-risk members who DON'T already have an open
 * follow-up, ordered by how much a call is worth right now (severity ×
 * recoverability × relationship proximity — see engagement/impact.ts), each
 * with "why" chips. This answers "who should I call first" when a leader only
 * has time for a handful of calls, rather than dumping the whole at-risk list.
 *
 * Scope-aware (unit admins see only their members) and Pro-gated by data: Free
 * orgs have no scored members, so this returns []. New members are intentionally
 * excluded — first-contact/onboarding is a separate flow from recovery.
 */
export const careQueue = query({
    args: {
        organization_id: v.optional(v.id("organizations")),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const orgId = isSuperAdmin(user)
            ? args.organization_id
            : await resolveOrgId(ctx, args.organization_id);
        if (!orgId) return [];

        const limit = Math.min(Math.max(args.limit ?? 12, 1), 50);
        const scope = await resolveManagedMemberIds(ctx);
        const nowMs = Date.now();

        // Members already in an open follow-up loop — excluded from the queue.
        const openTaskMemberIds = new Set<string>();
        for (const status of OPEN_TASK_STATUSES) {
            const rows = await ctx.db
                .query("care_tasks")
                .withIndex("by_org_and_status", (q) =>
                    q.eq("organization_id", orgId).eq("status", status),
                )
                .take(1000);
            for (const r of rows) openTaskMemberIds.add(r.member_id as string);
        }

        // Lowest-scoring members first (the at-risk pool). The trailing index
        // field excludes unscored members (Free orgs / not-yet-computed).
        const candidates = await ctx.db
            .query("members")
            .withIndex("by_org_and_engagement_score", (q) =>
                q.eq("organization_id", orgId).gte("engagement_score", 0),
            )
            .order("asc")
            .take(200);

        const ranked = candidates
            .filter(
                (m) =>
                    !m.archived_at &&
                    (m.engagement_risk_level === "high" ||
                        m.engagement_risk_level === "medium") &&
                    !openTaskMemberIds.has(m._id as string) &&
                    (isOrgWideScope(scope) || scope.has(m._id)),
            )
            .map((m) => {
                const breakdown = parseBreakdown(m.engagement_breakdown);
                const daysSinceLast = breakdown?.days_since_last;
                const impact = impactScore({
                    score: m.engagement_score,
                    breakdown,
                    daysSinceLast,
                    hasHousehold: !!m.household_id,
                });
                return {
                    id: m._id,
                    name: m.name,
                    avatar_url: m.avatar_url,
                    engagement_score: m.engagement_score,
                    engagement_risk_level: m.engagement_risk_level,
                    household_id: m.household_id,
                    impact,
                    impact_level: impactLevel(impact),
                    days_since_last: daysSinceLast,
                    reasons: queueReasons({
                        riskLevel: m.engagement_risk_level,
                        breakdown,
                        daysSinceLast,
                        lastCareContactAt: breakdown?.last_care_contact_at,
                        nowMs,
                    }),
                };
            });

        ranked.sort((a, b) => b.impact - a.impact);
        return ranked.slice(0, limit);
    },
});

/**
 * Care-loop outcome attribution — "Members Recovered". For members who had a
 * follow-up created while at risk within the window, compares their risk level
 * at that time (snapshotted on the task) against their current level. Because
 * the engagement score already folds in attendance recency/trend, a move back
 * to "low" genuinely reflects re-engagement — no separate attendance read.
 *
 * Forward-looking by nature: it measures tasks created from this release on,
 * once baselines are being snapshotted. Scope-aware and Pro-gated by data.
 */
export const careImpactStats = query({
    args: {
        organization_id: v.optional(v.id("organizations")),
        window_days: v.optional(v.number()),
        // The dashboard's unit filter: only follow-ups with this unit's members.
        unit_id: v.optional(v.id("units")),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const orgId = isSuperAdmin(user)
            ? args.organization_id
            : await resolveOrgId(ctx, args.organization_id);
        const windowDays = Math.min(Math.max(args.window_days ?? 90, 7), 365);
        const empty = {
            windowDays,
            scoringActive: false,
            atRiskContacted: 0,
            recovered: 0,
            improving: 0,
            stillAtRisk: 0,
            recoveryRate: 0,
        };
        if (!orgId) return empty;

        const scope = await resolveManagedMemberIds(ctx);
        const unitIds = args.unit_id ? await unitMemberIds(ctx, args.unit_id) : null;
        const callerOrg = callerOrgId(ctx, user);
        const cutoffIso = new Date(Date.now() - windowDays * 24 * 3600 * 1000).toISOString();

        // Does engagement scoring apply to this org at all? (Pro orgs get scored
        // by the daily recompute; Free orgs never do.) Drives whether the UI
        // shows an empty "recoveries will appear here" state vs. nothing.
        const anyScored = await ctx.db
            .query("members")
            .withIndex("by_org_and_engagement_score", (q) =>
                q.eq("organization_id", orgId).gte("engagement_score", 0),
            )
            .first();
        const scoringActive = !!anyScored;

        const tasks = await ctx.db
            .query("care_tasks")
            .withIndex("by_org", (q) => q.eq("organization_id", orgId))
            .order("desc")
            .take(500);

        // Per member, keep the most-severe at-risk baseline across their tasks
        // in the window (a "high" baseline dominates a later "medium" one).
        const baselineByMember = new Map<string, string>();
        for (const t of tasks) {
            if (t.created_at < cutoffIso) continue;
            if (!wasAtRisk(t.member_risk_at_contact)) continue;
            if (!memberIdInScope(t.member_id, orgId, scope, callerOrg)) continue;
            if (unitIds && !unitIds.has(t.member_id)) continue;
            const prev = baselineByMember.get(t.member_id as string);
            if (prev === "high") continue;
            baselineByMember.set(t.member_id as string, t.member_risk_at_contact!);
        }

        let recovered = 0;
        let improving = 0;
        let stillAtRisk = 0;
        await Promise.all(
            Array.from(baselineByMember.entries()).map(async ([memberId, baseline]) => {
                const member = (await ctx.db.get(memberId as Id<"members">)) as
                    | Doc<"members">
                    | null;
                const outcome = recoveryOutcome(baseline, member?.engagement_risk_level);
                if (outcome === "recovered") recovered++;
                else if (outcome === "improving") improving++;
                else stillAtRisk++;
            }),
        );

        const atRiskContacted = baselineByMember.size;
        const recoveryRate =
            atRiskContacted === 0 ? 0 : Math.round((recovered / atRiskContacted) * 100);

        return {
            windowDays,
            scoringActive,
            atRiskContacted,
            recovered,
            improving,
            stillAtRisk,
            recoveryRate,
        };
    },
});
