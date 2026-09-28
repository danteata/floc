// =============================================================================
// Dispatcher — drains automation_tasks and performs delivery.
//
// Two lanes:
//  • Transactional actions (in-app, labels, log, notify-leaders) run inside the
//    `drain` mutation — pure DB writes, no external I/O.
//  • External SMS runs in the `runExternal` action: it claims tasks (guardrails
//    applied in `claimSmsBatch`), calls the provider via fetch, then settles
//    each task with `settleTask`. This keeps a flaky/slow provider off the
//    transactional path entirely.
// =============================================================================

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, internalAction, internalMutation } from "../_generated/server";
import { categoryForAction } from "./catalog";
import { isRealPhone } from "./facts";
import {
    checkSmsRate,
    isAutomationEnabled,
    isWithinWindow,
    localMinutesNow,
    parseHHMM,
} from "./guardrails";
import { getSmsProvider } from "./providers";

const BATCH = 50;
const SMS_BATCH = 20;
const QUIET_RECHECK_MS = 15 * 60 * 1000;

// Transactional lanes handled directly in the drain mutation.
const TRANSACTIONAL_CHANNELS = ["in_app", "internal", "email"] as const;

// ---------------------------------------------------------------------------
// Drain (transactional lane + orchestration)
// ---------------------------------------------------------------------------

export const drain = internalMutation({
    args: {},
    handler: async (ctx) => {
        if (!(await isAutomationEnabled(ctx))) return { disabled: true };

        const nowIso = new Date().toISOString();

        // 1. Promote deferred tasks whose backoff has elapsed back to pending.
        const dueDeferred = await ctx.db
            .query("automation_tasks")
            .withIndex("by_status_and_next_attempt", (q) =>
                q.eq("status", "deferred").lte("next_attempt_at", nowIso),
            )
            .take(BATCH);
        for (const t of dueDeferred) {
            await ctx.db.patch(t._id, { status: "pending", next_attempt_at: undefined });
        }

        // 2. Process transactional lanes.
        let anyFull = false;
        for (const channel of TRANSACTIONAL_CHANNELS) {
            const tasks = await ctx.db
                .query("automation_tasks")
                .withIndex("by_status_and_channel", (q) =>
                    q.eq("status", "pending").eq("channel", channel),
                )
                .take(BATCH);
            for (const task of tasks) {
                try {
                    await processTask(ctx, task);
                } catch (err) {
                    await finish(ctx, task, "failed", "failed", undefined, err instanceof Error ? err.message : String(err));
                }
            }
            if (tasks.length === BATCH) anyFull = true;
        }

        // 3. Hand SMS off to the external action if any are pending.
        const nextSms = await ctx.db
            .query("automation_tasks")
            .withIndex("by_status_and_channel", (q) =>
                q.eq("status", "pending").eq("channel", "sms"),
            )
            .first();
        if (nextSms) {
            await ctx.scheduler.runAfter(0, internal.automation.dispatch.runExternal, {});
        }

        // 4. Keep draining transactional work if a lane was saturated.
        if (anyFull || dueDeferred.length === BATCH) {
            await ctx.scheduler.runAfter(0, internal.automation.dispatch.drain, {});
        }

        return { promoted: dueDeferred.length };
    },
});

async function processTask(ctx: MutationCtx, task: Doc<"automation_tasks">) {
    const rendered = (task.rendered || {}) as Record<string, any>;
    const preview: string | undefined = rendered.body ?? rendered.subject ?? rendered.tag ?? rendered.note;

    if (task.dry_run) {
        await finish(ctx, task, "dry_run", "dry_run", preview);
        return;
    }

    if (await alreadySent(ctx, task.dedup_key)) {
        await finish(ctx, task, "deduped", "deduped", preview);
        return;
    }

    switch (task.action_key) {
        case "log_only":
            await finish(ctx, task, "sent", "sent", preview);
            return;

        case "send_in_app": {
            if (!task.member_id) return void (await finish(ctx, task, "failed", "failed", preview, "no member"));
            const title = rendered.title || "Notification";
            const body = rendered.body || "";
            await insertInApp(ctx, {
                orgId: task.organization_id,
                memberId: task.member_id,
                title,
                body,
                category: rendered.category || categoryForAction(task.action_key),
                ruleId: task.rule_id,
            });
            // in_app_notifications has no reader yet (no member inbox), so on
            // its own nobody would ever see this. The notification bell reads
            // `notifications` by clerk user, so deliver there when the member
            // has a Floc account; without one there is nowhere to show it, and
            // the outcome says so instead of claiming it was sent.
            const clerkUserId = await resolveClerkUserIdForMember(ctx, task.member_id);
            if (!clerkUserId) {
                return void (await finish(
                    ctx,
                    task,
                    "skipped_no_account",
                    "skipped_no_account",
                    preview,
                    "This member has no Floc account, so there is nowhere to show an in-app notification.",
                ));
            }
            await ctx.db.insert("notifications", {
                clerk_user_id: clerkUserId,
                organization_id: task.organization_id,
                type: "automation",
                title,
                body,
                created_at: new Date().toISOString(),
            });
            await finish(ctx, task, "sent", "sent", preview);
            return;
        }

        case "add_label": {
            if (!task.member_id || !rendered.label_id)
                return void (await finish(ctx, task, "failed", "failed", preview, "missing member/label"));
            await addLabel(ctx, task.member_id, rendered.label_id as Id<"labels">);
            await finish(ctx, task, "sent", "sent", preview);
            return;
        }

        case "remove_label": {
            if (!task.member_id || !rendered.label_id)
                return void (await finish(ctx, task, "failed", "failed", preview, "missing member/label"));
            await removeLabel(ctx, task.member_id, rendered.label_id as Id<"labels">);
            await finish(ctx, task, "sent", "sent", preview);
            return;
        }

        case "notify_leaders": {
            if (!task.member_id) return void (await finish(ctx, task, "failed", "failed", preview, "no member"));
            const count = await notifyLeaders(ctx, task, rendered.body || "");
            await finish(ctx, task, "sent", "sent", `${preview ?? ""} (${count} leaders)`);
            return;
        }

        case "create_follow_up_task": {
            if (!task.member_id) return void (await finish(ctx, task, "failed", "failed", preview, "no member"));
            const leaderId = await resolvePrimaryLeader(ctx, task.member_id);
            if (!leaderId) {
                return void (await finish(ctx, task, "failed", "failed", preview, "no assignable leader"));
            }

            const now = new Date().toISOString();
            // Snapshot the member's at-risk baseline for recovery attribution
            // (engagement/impact.ts), same as manual care-task creation.
            const careMember = await ctx.db.get(task.member_id);
            const careTaskId = await ctx.db.insert("care_tasks", {
                organization_id: task.organization_id,
                member_id: task.member_id,
                assigned_to: leaderId,
                status: "pending",
                source: "automation",
                rule_id: task.rule_id,
                created_at: now,
                updated_at: now,
                member_score_at_contact: careMember?.engagement_score,
                member_risk_at_contact: careMember?.engagement_risk_level,
            });
            await ctx.db.insert("care_task_notes", {
                care_task_id: careTaskId,
                organization_id: task.organization_id,
                status: "pending",
                note: rendered.note,
                created_by_name: "Automation",
                created_at: now,
            });

            const clerkUserId = await resolveClerkUserIdForMember(ctx, leaderId);
            if (clerkUserId) {
                await ctx.db.insert("notifications", {
                    clerk_user_id: clerkUserId,
                    organization_id: task.organization_id,
                    type: "care",
                    title: "New follow-up assigned",
                    body: rendered.note || preview || "A member needs follow-up.",
                    created_at: now,
                });
            }

            await finish(ctx, task, "sent", "sent", preview);
            return;
        }

        case "send_email":
            // Email provider lands in Phase 3.
            await finish(ctx, task, "skipped_no_provider", "skipped_no_provider", preview);
            return;

        default:
            await finish(ctx, task, "failed", "failed", preview, `unhandled action ${task.action_key}`);
            return;
    }
}

// ---------------------------------------------------------------------------
// External lane (SMS): claim -> send -> settle
// ---------------------------------------------------------------------------

type ClaimedSms = { taskId: Id<"automation_tasks">; to: string; body: string };

export const runExternal = internalAction({
    args: {},
    handler: async (ctx) => {
        const provider = getSmsProvider();
        const claimed: ClaimedSms[] = await ctx.runMutation(
            internal.automation.dispatch.claimSmsBatch,
            { limit: SMS_BATCH },
        );

        for (const task of claimed) {
            if (!provider) {
                await ctx.runMutation(internal.automation.dispatch.settleTask, {
                    taskId: task.taskId,
                    outcome: "skipped_no_provider",
                    preview: task.body,
                });
                continue;
            }
            try {
                const res = await provider.send(task.to, task.body);
                await ctx.runMutation(internal.automation.dispatch.settleTask, {
                    taskId: task.taskId,
                    outcome: "sent",
                    provider: res.provider,
                    provider_message_id: res.id,
                    preview: task.body,
                });
            } catch (err) {
                await ctx.runMutation(internal.automation.dispatch.settleTask, {
                    taskId: task.taskId,
                    outcome: "failed",
                    error: err instanceof Error ? err.message : String(err),
                    preview: task.body,
                });
            }
        }

        if (claimed.length === SMS_BATCH) {
            await ctx.scheduler.runAfter(0, internal.automation.dispatch.runExternal, {});
        }
        return { claimed: claimed.length };
    },
});

/**
 * Select pending SMS tasks, apply guardrails (dry-run, dedup, consent, quiet
 * hours, rate caps), and atomically mark the survivors "sending". Blocked tasks
 * are settled or deferred here and NOT returned. Runs as a transaction, so no
 * two claim passes can hand out the same task.
 */
export const claimSmsBatch = internalMutation({
    args: { limit: v.number() },
    handler: async (ctx, args): Promise<ClaimedSms[]> => {
        if (!(await isAutomationEnabled(ctx))) return [];

        const nowMs = Date.now();
        const pending = await ctx.db
            .query("automation_tasks")
            .withIndex("by_status_and_channel", (q) =>
                q.eq("status", "pending").eq("channel", "sms"),
            )
            .take(args.limit);

        const orgQuietCache = new Map<string, { tz?: string; start: number | null; end: number | null }>();
        const result: ClaimedSms[] = [];

        for (const task of pending) {
            const rendered = (task.rendered || {}) as Record<string, any>;
            const body: string = rendered.body || "";
            const preview = body;

            if (task.dry_run) {
                await finish(ctx, task, "dry_run", "dry_run", preview);
                continue;
            }
            if (await alreadySent(ctx, task.dedup_key)) {
                await finish(ctx, task, "deduped", "deduped", preview);
                continue;
            }
            if (!task.member_id) {
                await finish(ctx, task, "failed", "failed", preview, "no member");
                continue;
            }
            const member = await ctx.db.get(task.member_id);
            if (!member) {
                await finish(ctx, task, "failed", "failed", preview, "member not found");
                continue;
            }
            if (!isRealPhone(member.phone)) {
                await finish(ctx, task, "failed", "failed", preview, "no usable phone");
                continue;
            }

            const prefs = await ctx.db
                .query("member_messaging_prefs")
                .withIndex("by_member", (q) => q.eq("member_id", task.member_id!))
                .unique();
            if (prefs?.sms_opt_out) {
                await finish(ctx, task, "suppressed", "suppressed_consent", preview);
                continue;
            }

            // Quiet hours (unless the rule opts out).
            const rule = await ctx.db.get(task.rule_id);
            const respectQuiet = rule?.respect_quiet_hours !== false;
            if (respectQuiet) {
                const window = await resolveQuietWindow(ctx, task.organization_id, prefs, orgQuietCache);
                if (isWithinWindow(localMinutesNow(window.tz, nowMs), window.start, window.end)) {
                    await defer(ctx, task, QUIET_RECHECK_MS, nowMs, "quiet_hours");
                    continue;
                }
            }

            // Rate caps.
            const verdict = checkSmsRate(await recentSmsSendTimestamps(ctx, task.member_id), nowMs);
            if (!verdict.allowed) {
                await defer(ctx, task, verdict.retryAfterMs ?? 3600 * 1000, nowMs, verdict.reason ?? "rate_cap");
                continue;
            }

            // Passed — claim it.
            await ctx.db.patch(task._id, { status: "sending", attempts: task.attempts + 1 });
            result.push({ taskId: task._id, to: member.phone!, body });
        }

        return result;
    },
});

export const settleTask = internalMutation({
    args: {
        taskId: v.id("automation_tasks"),
        outcome: v.string(), // "sent" | "failed" | "skipped_no_provider"
        provider: v.optional(v.string()),
        provider_message_id: v.optional(v.string()),
        error: v.optional(v.string()),
        preview: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const task = await ctx.db.get(args.taskId);
        if (!task) return;
        const taskStatus = args.outcome === "sent" ? "sent" : args.outcome;
        await ctx.db.patch(task._id, {
            status: taskStatus,
            processed_at: new Date().toISOString(),
            last_error: args.error,
        });
        await ctx.db.insert("message_log", {
            organization_id: task.organization_id,
            member_id: task.member_id,
            rule_id: task.rule_id,
            channel: task.channel || "sms",
            dedup_key: task.dedup_key,
            category: categoryForAction(task.action_key),
            outcome: args.outcome,
            provider: args.provider,
            provider_message_id: args.provider_message_id,
            error: args.error,
            rendered_preview: args.preview,
            sent_at: new Date().toISOString(),
        });
    },
});

// ---------------------------------------------------------------------------
// Guardrail wiring
// ---------------------------------------------------------------------------

async function resolveQuietWindow(
    ctx: MutationCtx,
    orgId: Id<"organizations">,
    prefs: Doc<"member_messaging_prefs"> | null,
    cache: Map<string, { tz?: string; start: number | null; end: number | null }>,
): Promise<{ tz?: string; start: number | null; end: number | null }> {
    // Per-member override wins.
    const memberStart = parseHHMM(prefs?.quiet_start);
    const memberEnd = parseHHMM(prefs?.quiet_end);

    let orgWindow = cache.get(orgId as string);
    if (!orgWindow) {
        const org = await ctx.db.get(orgId);
        const cfg = await ctx.db
            .query("app_config")
            .withIndex("by_key", (q) => q.eq("key", "automation.quiet_hours"))
            .unique();
        const val = (cfg?.value || {}) as { start?: string; end?: string };
        orgWindow = {
            tz: org?.timezone,
            start: parseHHMM(val.start),
            end: parseHHMM(val.end),
        };
        cache.set(orgId as string, orgWindow);
    }

    if (memberStart !== null && memberEnd !== null) {
        return { tz: orgWindow.tz, start: memberStart, end: memberEnd };
    }
    return orgWindow;
}

async function recentSmsSendTimestamps(ctx: MutationCtx, memberId: Id<"members">): Promise<number[]> {
    const rows = await ctx.db
        .query("message_log")
        .withIndex("by_member_and_sent_at", (q) => q.eq("member_id", memberId))
        .order("desc")
        .take(50);
    return rows
        .filter((r) => r.channel === "sms" && r.outcome === "sent")
        .map((r) => Date.parse(r.sent_at))
        .filter((t) => !Number.isNaN(t));
}

async function defer(
    ctx: MutationCtx,
    task: Doc<"automation_tasks">,
    delayMs: number,
    nowMs: number,
    reason: string,
) {
    await ctx.db.patch(task._id, {
        status: "deferred",
        next_attempt_at: new Date(nowMs + delayMs).toISOString(),
        last_error: reason,
    });
}

// ---------------------------------------------------------------------------
// Action primitives
// ---------------------------------------------------------------------------

async function alreadySent(ctx: MutationCtx, dedupKey: string): Promise<boolean> {
    const prior = await ctx.db
        .query("message_log")
        .withIndex("by_dedup_key", (q) => q.eq("dedup_key", dedupKey))
        .take(20);
    return prior.some((m) => m.outcome === "sent");
}

async function insertInApp(
    ctx: MutationCtx,
    args: {
        orgId: Id<"organizations">;
        memberId: Id<"members">;
        title: string;
        body: string;
        category: string;
        ruleId?: Id<"automation_rules">;
    },
) {
    await ctx.db.insert("in_app_notifications", {
        organization_id: args.orgId,
        member_id: args.memberId,
        title: args.title,
        body: args.body,
        category: args.category,
        rule_id: args.ruleId,
        read: false,
        created_at: new Date().toISOString(),
    });
}

async function addLabel(ctx: MutationCtx, memberId: Id<"members">, labelId: Id<"labels">) {
    const existing = await ctx.db
        .query("member_labels")
        .withIndex("by_member", (q) => q.eq("member_id", memberId))
        .collect();
    if (existing.some((l) => (l.label_id as string) === (labelId as string))) return;
    await ctx.db.insert("member_labels", {
        member_id: memberId,
        label_id: labelId,
        assigned_by: "automation",
        assigned_by_name: "Automation",
    });
}

async function removeLabel(ctx: MutationCtx, memberId: Id<"members">, labelId: Id<"labels">) {
    const existing = await ctx.db
        .query("member_labels")
        .withIndex("by_member", (q) => q.eq("member_id", memberId))
        .collect();
    for (const row of existing) {
        if ((row.label_id as string) === (labelId as string)) await ctx.db.delete(row._id);
    }
}

/**
 * Resolve the Clerk user id behind a member record, if any (member.user_id ->
 * users, falling back to an email match — mirrors scope.ts's getLinkedMember
 * in the opposite direction). Unit leaders are always app users, but a
 * member's `user_id` link isn't always backfilled, so both paths are tried.
 */
async function resolveClerkUserIdForMember(
    ctx: MutationCtx,
    memberId: Id<"members">,
): Promise<string | null> {
    const member = await ctx.db.get(memberId);
    if (!member) return null;
    if (member.user_id) {
        const user = await ctx.db.get(member.user_id);
        if (user) return user.clerk_user_id;
    }
    if (member.email) {
        const user = await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", member.email))
            .first();
        if (user) return user.clerk_user_id;
    }
    return null;
}

async function notifyLeaders(ctx: MutationCtx, task: Doc<"automation_tasks">, body: string): Promise<number> {
    if (!task.member_id) return 0;
    const memberUnits = await ctx.db
        .query("member_units")
        .withIndex("by_member", (q) => q.eq("member_id", task.member_id!))
        .collect();

    const leaderMemberIds = new Set<string>();
    for (const mu of memberUnits) {
        const admins = await ctx.db
            .query("unit_admins")
            .withIndex("by_unit", (q) => q.eq("unit_id", mu.unit_id))
            .collect();
        for (const a of admins) {
            if (a.is_active !== false) leaderMemberIds.add(a.member_id as string);
        }
    }

    for (const leaderId of leaderMemberIds) {
        await insertInApp(ctx, {
            orgId: task.organization_id,
            memberId: leaderId as Id<"members">,
            title: "Automation alert",
            body,
            category: "alert",
            ruleId: task.rule_id,
        });

        // in_app_notifications has no UI consumer yet (no member-portal inbox).
        // Leaders are always logged-in app users, so also surface this in the
        // admin notification bell (clerk_user_id-keyed) so it's actually seen.
        const clerkUserId = await resolveClerkUserIdForMember(ctx, leaderId as Id<"members">);
        if (clerkUserId) {
            await ctx.db.insert("notifications", {
                clerk_user_id: clerkUserId,
                organization_id: task.organization_id,
                type: "care",
                title: "Automation alert",
                body,
                created_at: new Date().toISOString(),
            });
        }
    }
    return leaderMemberIds.size;
}

/**
 * Resolve one best assignee for a follow-up task (ownership needs a single
 * owner, unlike notifyLeaders' broadcast-to-all). Prefers the primary leader
 * ("leader" role) of the member's units, falling back to the first active
 * admin; null if the member is in no unit or the unit has no active admin.
 */
async function resolvePrimaryLeader(
    ctx: MutationCtx,
    memberId: Id<"members">,
): Promise<Id<"members"> | null> {
    const memberUnits = await ctx.db
        .query("member_units")
        .withIndex("by_member", (q) => q.eq("member_id", memberId))
        .collect();

    let fallbackAdmin: Id<"members"> | null = null;
    for (const mu of memberUnits) {
        const admins = await ctx.db
            .query("unit_admins")
            .withIndex("by_unit", (q) => q.eq("unit_id", mu.unit_id))
            .collect();
        for (const a of admins) {
            if (a.is_active === false) continue;
            if (a.role === "leader") return a.member_id;
            if (!fallbackAdmin) fallbackAdmin = a.member_id;
        }
    }
    return fallbackAdmin;
}

// ---------------------------------------------------------------------------
// Bookkeeping (transactional-lane finalizer)
// ---------------------------------------------------------------------------

async function finish(
    ctx: MutationCtx,
    task: Doc<"automation_tasks">,
    taskStatus: string,
    outcome: string,
    preview?: string,
    error?: string,
) {
    await ctx.db.patch(task._id, {
        status: taskStatus,
        attempts: task.attempts + 1,
        processed_at: new Date().toISOString(),
        last_error: error,
    });
    await ctx.db.insert("message_log", {
        organization_id: task.organization_id,
        member_id: task.member_id,
        rule_id: task.rule_id,
        channel: task.channel || "internal",
        dedup_key: task.dedup_key,
        category: categoryForAction(task.action_key),
        outcome,
        rendered_preview: preview,
        error,
        sent_at: new Date().toISOString(),
    });
}
