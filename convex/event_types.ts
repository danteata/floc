
import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { isSuperAdmin, requireSuperAdmin, requireOrgAdmin, resolveOrgId, getUserSafe, normalizeOrgId } from "./auth";

async function assertUnitsBelongToOrg(
    ctx: any,
    unitIds: Id<"units">[] | undefined,
    orgId: Id<"organizations"> | null,
) {
    if (!unitIds || unitIds.length === 0) return;
    if (!orgId) throw new Error("Organization is required when scoping an event type to units");

    for (const unitId of unitIds) {
        const unit = await ctx.db.get(unitId);
        if (!unit || unit.organization_id !== orgId) {
            throw new Error("One or more selected units are outside this organization");
        }
    }
}

/** The event types a church sees: shared defaults, replaced by the church's own copy of the same value. */
export function mergeOrgOverrides(types: any[], orgId: Id<"organizations"> | null) {
    const visible = types.filter((type) => !type.organization_id || type.organization_id === orgId);
    const byValue = new Map<string, any>();

    for (const type of visible) {
        const existing = byValue.get(type.value);
        if (!existing || type.organization_id === orgId) {
            byValue.set(type.value, type);
        }
    }

    return Array.from(byValue.values())
        .filter((type) => type.is_active)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

/**
 * Every event type id a church's records for `value` may be filed under: the
 * shared default and the church's own copy (made when it edits the default).
 * Attendance filed before and after that edit must count as one service.
 */
export async function eventTypeIdsForValue(
    ctx: QueryCtx,
    orgId: Id<"organizations"> | null,
    value: string,
): Promise<Set<Id<"event_types">>> {
    const rows = await ctx.db
        .query("event_types")
        .withIndex("by_value", (q) => q.eq("value", value))
        .collect();
    return new Set(
        rows.filter((t) => !t.organization_id || t.organization_id === orgId).map((t) => t._id),
    );
}

/**
 * The event type rows a reset or template load may replace: the current
 * church's own rows when there is one, otherwise (a super admin working
 * outside any church) the shared defaults. Never another church's rows.
 */
async function replaceableEventTypes(ctx: any, orgId: Id<"organizations"> | null) {
    if (orgId) {
        return await ctx.db
            .query("event_types")
            .withIndex("by_org", (q: any) => q.eq("organization_id", orgId))
            .collect();
    }
    const rows = await ctx.db
        .query("event_types")
        .withIndex("by_org", (q: any) => q.eq("organization_id", undefined))
        .collect();
    return rows.filter((t: any) => !t.organization_id);
}

export const getAll = query({
    args: {},
    handler: async (ctx) => {
        // Use getUserSafe + normalizeOrgId (not requireUser/resolveOrgId) so
        // a user who isn't synced yet, or whose organization_id hasn't been
        // attached yet (e.g. mid-onboarding), gets an empty list instead of
        // a thrown error.
        const user = await getUserSafe(ctx);
        if (!user) return [];
        const orgId = normalizeOrgId(ctx, user.organization_id);
        if (!isSuperAdmin(user) && !orgId) return [];
        const types = await ctx.db
            .query("event_types")
            .collect();
        if (isSuperAdmin(user) && !orgId) {
            return types
                .filter(t => t.is_active)
                .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        }
        return mergeOrgOverrides(types, orgId);
    },
});

export const listAll = query({
    args: {},
    handler: async (ctx) => {
        const user = await getUserSafe(ctx);
        if (!user) return [];
        const orgId = normalizeOrgId(ctx, user.organization_id);
        if (!isSuperAdmin(user) && !orgId) return [];
        const types = await ctx.db.query("event_types").collect();
        if (isSuperAdmin(user) && !orgId) return types;
        return types.filter((type) => !type.organization_id || type.organization_id === orgId);
    }
});

export const create = mutation({
    args: {
        value: v.string(),
        label: v.string(),
        color: v.optional(v.string()),
        icon: v.optional(v.string()),
        category: v.optional(v.string()),
        description: v.optional(v.string()),
        default_time: v.optional(v.string()),
        is_active: v.boolean(),
        sort_order: v.number(),
        unit_ids: v.optional(v.array(v.id("units"))),
    },
    handler: async (ctx, args) => {
        const user = await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx);
        await assertUnitsBelongToOrg(ctx, args.unit_ids, orgId);

        if (orgId) {
            const existing = await ctx.db
                .query("event_types")
                .withIndex("by_org_and_value", (q) => q.eq("organization_id", orgId).eq("value", args.value))
                .first();
            if (existing) throw new Error("An event type with this value already exists");
        }

        return await ctx.db.insert("event_types", {
            ...args,
            organization_id: isSuperAdmin(user) ? undefined : orgId ?? undefined,
        });
    },
});

export const update = mutation({
    args: {
        id: v.id("event_types"),
        updates: v.object({
            label: v.optional(v.string()),
            color: v.optional(v.string()),
            icon: v.optional(v.string()),
            category: v.optional(v.string()),
            description: v.optional(v.string()),
            default_time: v.optional(v.string()),
            is_active: v.optional(v.boolean()),
            sort_order: v.optional(v.number()),
            unit_ids: v.optional(v.array(v.id("units"))),
        }),
    },
    handler: async (ctx, args) => {
        const user = await requireOrgAdmin(ctx);
        const existing = await ctx.db.get(args.id);
        if (!existing) throw new Error("Event type not found");

        const orgId = await resolveOrgId(ctx, existing.organization_id);
        await assertUnitsBelongToOrg(ctx, args.updates.unit_ids, orgId);

        if (!existing.organization_id && !isSuperAdmin(user)) {
            const orgOverride = orgId
                ? await ctx.db
                    .query("event_types")
                    .withIndex("by_org_and_value", (q) => q.eq("organization_id", orgId).eq("value", existing.value))
                    .first()
                : null;

            const overrideDoc = {
                value: existing.value,
                label: args.updates.label ?? existing.label,
                color: args.updates.color ?? existing.color,
                icon: args.updates.icon ?? existing.icon,
                category: args.updates.category ?? existing.category,
                description: args.updates.description ?? existing.description,
                default_time: args.updates.default_time ?? existing.default_time,
                is_active: args.updates.is_active ?? existing.is_active,
                sort_order: args.updates.sort_order ?? existing.sort_order,
                unit_ids: args.updates.unit_ids ?? existing.unit_ids,
                organization_id: orgId ?? undefined,
            };

            if (orgOverride) {
                await ctx.db.patch(orgOverride._id, overrideDoc);
            } else {
                await ctx.db.insert("event_types", overrideDoc);
            }
            return;
        }

        await ctx.db.patch(args.id, args.updates);
    },
});

export const remove = mutation({
    args: { id: v.id("event_types") },
    handler: async (ctx, args) => {
        const user = await requireOrgAdmin(ctx);
        const existing = await ctx.db.get(args.id);
        if (!existing) throw new Error("Event type not found");

        const orgId = await resolveOrgId(ctx, existing.organization_id);
        if (!existing.organization_id && !isSuperAdmin(user)) {
            const orgOverride = orgId
                ? await ctx.db
                    .query("event_types")
                    .withIndex("by_org_and_value", (q) => q.eq("organization_id", orgId).eq("value", existing.value))
                    .first()
                : null;

            const overrideDoc = {
                value: existing.value,
                label: existing.label,
                color: existing.color,
                icon: existing.icon,
                category: existing.category,
                description: existing.description,
                default_time: existing.default_time,
                is_active: false,
                sort_order: existing.sort_order,
                unit_ids: existing.unit_ids,
                organization_id: orgId ?? undefined,
            };

            if (orgOverride) {
                await ctx.db.patch(orgOverride._id, overrideDoc);
            } else {
                await ctx.db.insert("event_types", overrideDoc);
            }
            return;
        }

        await ctx.db.delete(args.id);
    },
});

export const resetToDefaults = mutation({
    args: {},
    handler: async (ctx) => {
        await requireSuperAdmin(ctx);
        const orgId = await resolveOrgId(ctx);
        // Replace only the current church's rows (or, outside a church, the
        // shared defaults), never every church's event types.
        for (const t of await replaceableEventTypes(ctx, orgId)) {
            await ctx.db.delete(t._id);
        }

        const defaults = [
            { value: 'sunday-service', label: 'Sunday Service', color: 'default', icon: 'church', is_active: true, sort_order: 1 },
            { value: 'bible-study', label: 'Bible Study', color: 'secondary', icon: 'book', is_active: true, sort_order: 2 },
            { value: 'youth-group', label: 'Youth Group', color: 'outline', icon: 'users', is_active: true, sort_order: 3 },
            { value: 'children-youth', label: 'Children & Youth', color: 'secondary', icon: 'heart', is_active: true, sort_order: 4 },
            { value: 'prayer-meeting', label: 'Prayer Meeting', color: 'outline', icon: 'hands', is_active: true, sort_order: 5 },
            { value: 'worship-night', label: 'Worship Night', color: 'default', icon: 'music', is_active: true, sort_order: 6 },
            { value: 'community-outreach', label: 'Community Outreach', color: 'outline', icon: 'globe', is_active: true, sort_order: 7 },
            { value: 'fellowship', label: 'Fellowship', color: 'secondary', icon: 'coffee', is_active: true, sort_order: 8 },
            { value: 'conference', label: 'Conference', color: 'default', icon: 'presentation', is_active: true, sort_order: 9 },
            { value: 'other', label: 'Other', color: 'outline', icon: 'calendar', is_active: true, sort_order: 10 },
        ];

        for (const t of defaults) {
            await ctx.db.insert("event_types", { ...t, organization_id: orgId ?? undefined });
        }
    }
});

export const loadTemplate = mutation({
    args: { templateName: v.string() },
    handler: async (ctx, args) => {
        await requireSuperAdmin(ctx);
        const orgId = await resolveOrgId(ctx);
        const config = await ctx.db
            .query("app_config")
            .withIndex("by_key", (q) => q.eq("key", "event_types_templates"))
            .first();

        if (!config || !config.value) throw new Error("Templates not found");

        const templates = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
        const template = templates[args.templateName];

        if (!template || !Array.isArray(template)) throw new Error("Template not found");

        // Replace only the current church's rows (or, outside a church, the
        // shared defaults), never every church's event types.
        for (const t of await replaceableEventTypes(ctx, orgId)) {
            await ctx.db.delete(t._id);
        }

        for (let i = 0; i < template.length; i++) {
            const t = template[i];
            await ctx.db.insert("event_types", {
                value: t.value,
                label: t.label,
                color: t.color || 'outline',
                icon: t.icon || 'calendar',
                category: t.category,
                description: t.description,
                is_active: true,
                sort_order: i + 1,
                organization_id: orgId ?? undefined,
            });
        }
    }
});
