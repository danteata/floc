// =============================================================================
// Automation rules — public API (CRUD, simulate, logs, catalog).
//
// Org-scoped: writes require an org admin; reads require org access. All calls
// go through the existing auth guards (resolveOrgId / requireOrgAccess).
// =============================================================================

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { requireOrgAccess, requireOrgAdmin, resolveOrgId } from "../auth";
import { requireFeature } from "../entitlements";
import {
    ACTION_CATALOG,
    TRIGGER_CATALOG,
    getActionSpec,
    getTriggerSpec,
    isDerivedTrigger,
} from "./catalog";
import { queueRuleActions } from "./engine";
import { buildMemberFacts, buildOrgFacts, loadMemberAttendedIds, loadOrgAttendanceContext } from "./facts";
import { matchMemberAgainstDerivedRule, rulesNeedStreak } from "./scan";

// ---------------------------------------------------------------------------
// Catalog (for the rule builder UI)
// ---------------------------------------------------------------------------

export const getCatalog = query({
    args: {},
    handler: async () => {
        return { triggers: TRIGGER_CATALOG, actions: ACTION_CATALOG };
    },
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateRuleShape(triggerKey: string, actions: any[]) {
    if (!getTriggerSpec(triggerKey)) {
        throw new Error(`Unknown trigger: ${triggerKey}`);
    }
    if (!Array.isArray(actions) || actions.length === 0) {
        throw new Error("A rule must have at least one action");
    }
    for (const a of actions) {
        if (!a || typeof a.key !== "string" || !getActionSpec(a.key)) {
            throw new Error(`Unknown action: ${a?.key}`);
        }
    }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export const listRules = query({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        await requireOrgAccess(ctx, args.organization_id);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) return [];
        return await ctx.db
            .query("automation_rules")
            .withIndex("by_org", (q) => q.eq("organization_id", orgId))
            .order("desc")
            .collect();
    },
});

export const getRule = query({
    args: { id: v.id("automation_rules") },
    handler: async (ctx, args) => {
        const rule = await ctx.db.get(args.id);
        if (!rule) return null;
        await requireOrgAccess(ctx, rule.organization_id);
        return rule;
    },
});

export const createRule = mutation({
    args: {
        organization_id: v.optional(v.id("organizations")),
        name: v.string(),
        description: v.optional(v.string()),
        trigger_key: v.string(),
        trigger_params: v.optional(v.any()),
        conditions: v.optional(v.any()),
        actions: v.array(v.any()),
        unit_ids: v.optional(v.array(v.id("units"))),
        cooldown_days: v.optional(v.number()),
        dedup_bucket: v.optional(v.string()),
        respect_quiet_hours: v.optional(v.boolean()),
        status: v.optional(v.string()),
        dry_run: v.optional(v.boolean()),
        priority: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const user = await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) throw new Error("Organization not set");
        await requireFeature(ctx, "automations", orgId);
        validateRuleShape(args.trigger_key, args.actions);

        const now = new Date().toISOString();
        const id = await ctx.db.insert("automation_rules", {
            organization_id: orgId,
            name: args.name,
            description: args.description,
            trigger_key: args.trigger_key,
            trigger_params: args.trigger_params,
            conditions: args.conditions,
            actions: args.actions,
            unit_ids: args.unit_ids,
            cooldown_days: args.cooldown_days,
            dedup_bucket: args.dedup_bucket ?? "day",
            respect_quiet_hours: args.respect_quiet_hours ?? true,
            // New rules default to draft + dry_run for safety.
            status: args.status ?? "draft",
            dry_run: args.dry_run ?? true,
            priority: args.priority,
            created_by: user.clerk_user_id,
            created_by_name: user.name,
            created_at: now,
        });

        await ctx.runMutation(internal.audit.logEvent, {
            action: "automation.rule_created",
            entity_type: "automation_rule",
            entity_id: id,
            entity_name: args.name,
            performed_by: user.clerk_user_id,
            performed_by_name: user.name || "Unknown",
            performed_by_role: user.role,
            organization_id: orgId,
        });

        return id;
    },
});

export const updateRule = mutation({
    args: {
        id: v.id("automation_rules"),
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        trigger_key: v.optional(v.string()),
        trigger_params: v.optional(v.any()),
        conditions: v.optional(v.any()),
        actions: v.optional(v.array(v.any())),
        unit_ids: v.optional(v.array(v.id("units"))),
        cooldown_days: v.optional(v.number()),
        dedup_bucket: v.optional(v.string()),
        respect_quiet_hours: v.optional(v.boolean()),
        dry_run: v.optional(v.boolean()),
        priority: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const rule = await ctx.db.get(args.id);
        if (!rule) throw new Error("Rule not found");
        await requireOrgAdmin(ctx);
        await requireOrgAccess(ctx, rule.organization_id);

        const triggerKey = args.trigger_key ?? rule.trigger_key;
        const actions = args.actions ?? (rule.actions as any[]);
        validateRuleShape(triggerKey, actions);

        const { id, ...rest } = args;
        await ctx.db.patch(args.id, { ...rest, updated_at: new Date().toISOString() });
        return { ok: true };
    },
});

export const setRuleStatus = mutation({
    args: {
        id: v.id("automation_rules"),
        status: v.string(), // "draft" | "enabled" | "paused"
        dry_run: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const rule = await ctx.db.get(args.id);
        if (!rule) throw new Error("Rule not found");
        const user = await requireOrgAdmin(ctx);
        await requireOrgAccess(ctx, rule.organization_id);

        if (!["draft", "enabled", "paused"].includes(args.status)) {
            throw new Error("Invalid status");
        }
        if (args.status === "enabled") {
            await requireFeature(ctx, "automations", rule.organization_id);
        }

        const patch: Partial<Doc<"automation_rules">> = {
            status: args.status,
            updated_at: new Date().toISOString(),
        };
        if (args.dry_run !== undefined) patch.dry_run = args.dry_run;
        await ctx.db.patch(args.id, patch);

        await ctx.runMutation(internal.audit.logEvent, {
            action: `automation.rule_${args.status}`,
            entity_type: "automation_rule",
            entity_id: args.id,
            entity_name: rule.name,
            performed_by: user.clerk_user_id,
            performed_by_name: user.name || "Unknown",
            performed_by_role: user.role,
            organization_id: rule.organization_id,
        });

        return { ok: true };
    },
});

export const deleteRule = mutation({
    args: { id: v.id("automation_rules") },
    handler: async (ctx, args) => {
        const rule = await ctx.db.get(args.id);
        if (!rule) return { ok: true };
        const user = await requireOrgAdmin(ctx);
        await requireOrgAccess(ctx, rule.organization_id);
        await ctx.db.delete(args.id);

        await ctx.runMutation(internal.audit.logEvent, {
            action: "automation.rule_deleted",
            entity_type: "automation_rule",
            entity_id: args.id,
            entity_name: rule.name,
            performed_by: user.clerk_user_id,
            performed_by_name: user.name || "Unknown",
            performed_by_role: user.role,
            organization_id: rule.organization_id,
        });
        return { ok: true };
    },
});

// ---------------------------------------------------------------------------
// Simulate — "who would this rule match, and what would each get?"
//
// Runs the rule against current data WITHOUT sending or writing anything. Only
// derived triggers can be simulated over existing state; event triggers fire in
// real time. Implemented as a mutation that performs no writes (queueRuleActions
// short-circuits before any insert when simulate: true).
// ---------------------------------------------------------------------------

const SIMULATE_MEMBER_CAP = 2000;
const SIMULATE_SAMPLE_CAP = 25;

export const simulateRule = mutation({
    args: { id: v.id("automation_rules") },
    handler: async (ctx, args) => {
        const rule = await ctx.db.get(args.id);
        if (!rule) throw new Error("Rule not found");
        await requireOrgAdmin(ctx);
        await requireOrgAccess(ctx, rule.organization_id);

        if (!isDerivedTrigger(rule.trigger_key)) {
            return {
                supported: false,
                note: "This trigger fires on live events and can't be simulated against historical data. Enable it in dry-run to preview real sends.",
                matched_count: 0,
                scanned: 0,
                samples: [],
            };
        }

        const org = await buildOrgFacts(ctx, rule.organization_id);
        const orgAttendance = rulesNeedStreak([rule])
            ? await loadOrgAttendanceContext(ctx, rule.organization_id)
            : null;

        const fetched = await ctx.db
            .query("members")
            .withIndex("by_org", (q) => q.eq("organization_id", rule.organization_id))
            .take(SIMULATE_MEMBER_CAP);
        // Archived members never trigger automations, so they aren't counted.
        // The unit limit ("Limit to units") is applied per member by
        // queueRuleActions, the same check real runs use.
        const members = fetched.filter((m) => !m.archived_at);

        let matchedCount = 0;
        const samples: Array<{
            member_id: string;
            member_name: string;
            actions: Array<{ action_key: string; channel?: string; text: string; missing: string[] }>;
        }> = [];

        for (const member of members) {
            const memberFacts = await buildMemberFacts(ctx, member);
            const attendedIds = orgAttendance ? await loadMemberAttendedIds(ctx, member._id) : null;
            const { matched, facts } = matchMemberAgainstDerivedRule({
                rule,
                member,
                memberFacts,
                org,
                orgAttendance,
                attendedIds,
            });
            if (!matched) continue;

            // Apply the condition tree + render actions (no writes).
            const result = await queueRuleActions(ctx, {
                rule,
                facts,
                memberId: member._id,
                source: "simulate",
                simulate: true,
            });
            if (!result.matched) continue; // filtered out by conditions

            matchedCount++;
            if (samples.length < SIMULATE_SAMPLE_CAP) {
                samples.push({
                    member_id: member._id,
                    member_name: member.name,
                    actions: result.preview || [],
                });
            }
        }

        return {
            supported: true,
            matched_count: matchedCount,
            scanned: members.length,
            capped: fetched.length >= SIMULATE_MEMBER_CAP,
            samples,
        };
    },
});

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

export const listRecentRuns = query({
    args: { organization_id: v.optional(v.id("organizations")), limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        await requireOrgAccess(ctx, args.organization_id);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) return [];
        return await ctx.db
            .query("automation_runs")
            .withIndex("by_org", (q) => q.eq("organization_id", orgId))
            .order("desc")
            .take(args.limit ?? 50);
    },
});

export const listMessages = query({
    args: {
        organization_id: v.optional(v.id("organizations")),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        await requireOrgAccess(ctx, args.organization_id);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) return [];
        const rows = await ctx.db
            .query("message_log")
            .withIndex("by_org_and_sent_at", (q) => q.eq("organization_id", orgId))
            .order("desc")
            .take(args.limit ?? 100);

        // Name the member and the rule on each row (looked up once each).
        const memberNames = new Map<string, string | null>();
        const ruleNames = new Map<string, string | null>();
        for (const row of rows) {
            if (row.member_id && !memberNames.has(row.member_id)) {
                const member = await ctx.db.get(row.member_id);
                memberNames.set(row.member_id, member?.name ?? null);
            }
            if (row.rule_id && !ruleNames.has(row.rule_id)) {
                const rule = await ctx.db.get(row.rule_id);
                ruleNames.set(row.rule_id, rule?.name ?? null);
            }
        }
        return rows.map((row) => ({
            ...row,
            member_name: row.member_id ? memberNames.get(row.member_id) ?? null : null,
            rule_name: row.rule_id ? ruleNames.get(row.rule_id) ?? null : null,
        }));
    },
});

// ---------------------------------------------------------------------------
// Seed — create the starter rules from the plan (all draft + dry_run).
// ---------------------------------------------------------------------------

export const seedExampleRules = mutation({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        const user = await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) throw new Error("Organization not set");
        const now = new Date().toISOString();

        const created: Id<"automation_rules">[] = [];

        created.push(
            await ctx.db.insert("automation_rules", {
                organization_id: orgId,
                name: "3-week absence follow-up",
                description: "In-app follow-up when a member misses 3 consecutive Sunday services.",
                trigger_key: "member.consecutive_absences",
                trigger_params: { event_type_value: "sunday-service", threshold: 3 },
                conditions: {
                    op: "and",
                    children: [{ op: "eq", field: "member.status", value: "active" }],
                },
                actions: [
                    {
                        key: "send_in_app",
                        params: {
                            title: "We miss you",
                            template: "Hi {{member.first_name}}, we missed you at church for {{count}} weeks. Everything okay? From all of us at {{org.name}}",
                            category: "follow_up",
                        },
                    },
                    { key: "notify_leaders", params: { template: "{{member.name}} has been absent {{count}} times." } },
                ],
                cooldown_days: 30,
                dedup_bucket: "week",
                respect_quiet_hours: true,
                status: "draft",
                dry_run: true,
                created_by: user.clerk_user_id,
                created_by_name: user.name,
                created_at: now,
            }),
        );

        created.push(
            await ctx.db.insert("automation_rules", {
                organization_id: orgId,
                name: "Birthday greeting",
                description: "In-app birthday greeting on the member's birthday.",
                trigger_key: "member.birthday",
                trigger_params: { days_before: 0 },
                actions: [
                    {
                        key: "send_in_app",
                        params: {
                            title: "Happy birthday! 🎉",
                            template: "Happy birthday, {{member.first_name}}! 🎉 From all of us at {{org.name}}",
                            category: "info",
                        },
                    },
                ],
                dedup_bucket: "day",
                respect_quiet_hours: false,
                status: "draft",
                dry_run: true,
                created_by: user.clerk_user_id,
                created_by_name: user.name,
                created_at: now,
            }),
        );

        return { created };
    },
});
