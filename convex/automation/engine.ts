// =============================================================================
// Engine core — evaluate a rule against a subject and queue its actions.
//
// Shared by the scanner (derived triggers) and event processing (push
// triggers). This runs inside a mutation (transactional). It does NOT perform
// delivery — it inserts automation_tasks rows that the dispatcher drains. That
// decoupling is what keeps a flaky provider from ever blocking a source write.
// =============================================================================

import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";
import { orgIsPro } from "../entitlements";
import { ConditionNode, FactContext, RuleAction, categoryForAction, getActionSpec } from "./catalog";
import { evaluateCondition, isInRuleScope } from "./conditions";
import { renderTemplate } from "./templating";
import { localDayIn } from "../lib/timezone";

/** Today in the church's time zone (UTC when it hasn't set one). */
function dayBucket(timeZone?: string): string {
    return localDayIn(new Date(), timeZone);
}

function weekBucket(): string {
    const now = new Date();
    // ISO-week-ish: year + week number. Good enough for dedup granularity.
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const week = Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 3600 * 1000));
    return `${now.getUTCFullYear()}W${week}`;
}

function bucketKey(bucket?: string, timeZone?: string): string {
    if (bucket === "none") return "once";
    if (bucket === "week") return weekBucket();
    return dayBucket(timeZone);
}

/** Render an action's templated payload against the fact context. */
function renderAction(action: RuleAction, facts: FactContext): { payload: Record<string, any>; missing: string[]; preview: string } {
    const p = action.params || {};
    const payload: Record<string, any> = {};
    const missing: string[] = [];
    let preview = "";

    if (typeof p.template === "string") {
        const r = renderTemplate(p.template, facts);
        payload.body = r.text;
        missing.push(...r.missing);
        preview = r.text;
    }
    if (typeof p.subject === "string") {
        const r = renderTemplate(p.subject, facts);
        payload.subject = r.text;
        missing.push(...r.missing);
    }
    if (typeof p.title === "string") {
        const r = renderTemplate(p.title, facts);
        payload.title = r.text;
        missing.push(...r.missing);
    }
    if (typeof p.note === "string") {
        const r = renderTemplate(p.note, facts);
        payload.note = r.text;
        missing.push(...r.missing);
        if (!preview) preview = r.text;
    }
    if (p.template_id) payload.template_id = p.template_id;
    if (p.label_id) payload.label_id = p.label_id;
    if (p.category) payload.category = p.category;
    if (p.tag) payload.tag = p.tag;

    return { payload, missing, preview };
}

export type QueueResult = {
    matched: boolean;
    queued: number;
    skippedReason?: string;
    preview?: Array<{
        action_key: string;
        channel?: string;
        text: string;
        missing: string[];
    }>;
};

/**
 * Evaluate `rule`'s condition tree against `facts` and, if it matches, queue one
 * automation_task per action. Returns a preview instead of writing when
 * `simulate` is true (used by the dry-run/simulate UI).
 */
export async function queueRuleActions(
    ctx: MutationCtx,
    opts: {
        rule: Doc<"automation_rules">;
        facts: FactContext;
        memberId?: Id<"members">;
        source: "scan" | "event" | "simulate";
        simulate?: boolean;
    },
): Promise<QueueResult> {
    const { rule, facts, memberId, source } = opts;
    const simulate = opts.simulate === true;

    // 0. Scope: never archived members, and only the rule's units when it is
    // limited to some ("Limit to units" on the rule).
    if (!isInRuleScope(rule, facts.member)) return { matched: false, queued: 0 };

    // 1. Condition filter (the trigger already selected the subject).
    const matched = evaluateCondition(rule.conditions as ConditionNode | undefined, facts);
    if (!matched) return { matched: false, queued: 0 };

    const actions = (rule.actions || []) as RuleAction[];

    // Build preview for every action (used in simulate + stored on tasks).
    const rendered = actions.map((a) => ({ action: a, ...renderAction(a, facts) }));

    if (simulate) {
        return {
            matched: true,
            queued: 0,
            preview: rendered.map((r) => ({
                action_key: r.action.key,
                channel: getActionSpec(r.action.key)?.channel,
                text: r.preview || `[${r.action.key}]`,
                missing: r.missing,
            })),
        };
    }

    // 1b. Plan gate — defense in depth so a rule enabled before a Pro->Free
    // downgrade stops firing immediately, without a separate sweep job. This
    // runs from the scanner/event processor (no user identity in scope), so
    // it checks the org's plan directly rather than going through
    // requireFeature. Simulate (above) is exempt: it never sends anything,
    // so previewing is fine on Free (a taste of the feature); real delivery
    // requires Pro.
    if (!(await orgIsPro(ctx, rule.organization_id))) {
        return { matched: true, queued: 0, skippedReason: "plan_required" };
    }

    // 2. Cooldown (skip re-firing the same rule at the same member too soon).
    if (memberId && rule.cooldown_days && rule.cooldown_days > 0) {
        const state = await ctx.db
            .query("automation_state")
            .withIndex("by_rule_and_member", (q) =>
                q.eq("rule_id", rule._id).eq("member_id", memberId),
            )
            .unique();
        if (state?.last_fired_at) {
            const elapsed = Date.now() - new Date(state.last_fired_at).getTime();
            if (elapsed < rule.cooldown_days * 24 * 3600 * 1000) {
                return { matched: true, queued: 0, skippedReason: "cooldown" };
            }
        }
    }

    const now = new Date().toISOString();
    const dryRun = rule.dry_run === true;

    // 3. Run record (observability).
    const runId = await ctx.db.insert("automation_runs", {
        organization_id: rule.organization_id,
        rule_id: rule._id,
        trigger_key: rule.trigger_key,
        matched: true,
        subject_member_id: memberId,
        actions_queued: 0,
        dry_run: dryRun,
        source,
        started_at: now,
    });

    // 4. One task per action.
    const bkt = bucketKey(rule.dedup_bucket, facts.org?.timezone || undefined);
    let queued = 0;
    for (const r of rendered) {
        const spec = getActionSpec(r.action.key);
        if (!spec) continue; // unknown action key — ignore
        const dedupKey = `${rule._id}:${memberId ?? "org"}:${r.action.key}:${bkt}`;
        await ctx.db.insert("automation_tasks", {
            organization_id: rule.organization_id,
            rule_id: rule._id,
            run_id: runId,
            member_id: memberId,
            action_key: r.action.key,
            action_params: r.action.params,
            channel: spec.channel,
            rendered: r.payload,
            dedup_key: dedupKey,
            status: "pending",
            attempts: 0,
            dry_run: dryRun,
            created_at: now,
        });
        queued++;
    }

    await ctx.db.patch(runId, { actions_queued: queued });
    await ctx.db.patch(rule._id, { last_run_at: now });

    // 5. Record last-fired for cooldown (real runs only).
    if (memberId && !dryRun) {
        const state = await ctx.db
            .query("automation_state")
            .withIndex("by_rule_and_member", (q) =>
                q.eq("rule_id", rule._id).eq("member_id", memberId),
            )
            .unique();
        const lastValue = facts.streak?.count;
        if (state) {
            await ctx.db.patch(state._id, { last_fired_at: now, last_value: lastValue });
        } else {
            await ctx.db.insert("automation_state", {
                organization_id: rule.organization_id,
                rule_id: rule._id,
                member_id: memberId,
                last_fired_at: now,
                last_value: lastValue,
            });
        }
    }

    return { matched: true, queued };
}

export { categoryForAction };
