// =============================================================================
// Event inbox — push triggers.
//
// Existing mutations call emitEvent(...) after their own writes commit. It only
// inserts an automation_events row and schedules processing, so the source
// mutation stays fast and never depends on rule evaluation succeeding.
// =============================================================================

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, internalMutation } from "../_generated/server";
import { EventFacts, FactContext } from "./catalog";
import { queueRuleActions } from "./engine";
import { buildMemberFacts, buildOrgFacts } from "./facts";

/**
 * Enqueue an automation event and schedule its processing. Safe to call from
 * any mutation; failures here must never be thrown into the source write, so
 * callers should wrap in try/catch (see emitEventSafe).
 */
export async function emitEvent(
    ctx: MutationCtx,
    args: {
        orgId: Id<"organizations">;
        triggerKey: string;
        memberId?: Id<"members">;
        payload?: Record<string, any>;
    },
): Promise<void> {
    await ctx.db.insert("automation_events", {
        organization_id: args.orgId,
        trigger_key: args.triggerKey,
        subject_member_id: args.memberId,
        payload: args.payload,
        status: "pending",
        created_at: new Date().toISOString(),
    });
    await ctx.scheduler.runAfter(0, internal.automation.events.processEvents, {});
}

/** emitEvent that swallows its own errors — automation must never break a source write. */
export async function emitEventSafe(
    ctx: MutationCtx,
    args: { orgId: Id<"organizations">; triggerKey: string; memberId?: Id<"members">; payload?: Record<string, any> },
): Promise<void> {
    try {
        await emitEvent(ctx, args);
    } catch (err) {
        console.error("emitEvent failed (ignored):", args.triggerKey, err);
    }
}

const BATCH = 50;

/**
 * Drain pending automation_events: for each, load rules bound to its trigger and
 * evaluate them. Self-reschedules if a full batch was processed.
 */
export const processEvents = internalMutation({
    args: {},
    handler: async (ctx) => {
        const events = await ctx.db
            .query("automation_events")
            .withIndex("by_status", (q) => q.eq("status", "pending"))
            .take(BATCH);

        for (const evt of events) {
            try {
                await processOneEvent(ctx, evt);
                await ctx.db.patch(evt._id, { status: "processed" });
            } catch (err) {
                await ctx.db.patch(evt._id, {
                    status: "error",
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        if (events.length > 0) {
            // Always try to deliver whatever got queued.
            await ctx.scheduler.runAfter(0, internal.automation.dispatch.drain, {});
        }
        if (events.length === BATCH) {
            await ctx.scheduler.runAfter(0, internal.automation.events.processEvents, {});
        }
        return { processed: events.length };
    },
});

async function processOneEvent(ctx: MutationCtx, evt: Doc<"automation_events">) {
    const rules = await ctx.db
        .query("automation_rules")
        .withIndex("by_org_and_trigger", (q) =>
            q.eq("organization_id", evt.organization_id).eq("trigger_key", evt.trigger_key),
        )
        .collect();
    const active = rules.filter((r) => r.status === "enabled");
    if (active.length === 0) return;

    const org = await buildOrgFacts(ctx, evt.organization_id);
    const payload = (evt.payload || {}) as Record<string, any>;
    const eventFacts: EventFacts | undefined =
        Object.keys(payload).length > 0
            ? {
                  event_type_id: payload.event_type_id,
                  event_type_value: payload.event_type_value,
                  label: payload.label,
                  date: payload.date,
                  is_late: payload.is_late,
                  minutes_late: payload.minutes_late,
                  source: payload.source,
              }
            : undefined;

    let memberFacts;
    if (evt.subject_member_id) {
        const member = await ctx.db.get(evt.subject_member_id);
        if (member) memberFacts = await buildMemberFacts(ctx, member, org.timezone);
    }

    const facts: FactContext = { org, member: memberFacts, event: eventFacts };

    for (const rule of active) {
        await queueRuleActions(ctx, {
            rule,
            facts,
            memberId: evt.subject_member_id ?? undefined,
            source: "event",
        });
    }
}
