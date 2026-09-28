
import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { isOrgWideScope, resolveManagedMemberIds } from "./scope";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrgAdmin, requireOrgAccess, requireUser, resolveOrgId, isSuperAdmin } from "./auth";
import { api, internal } from "./_generated/api";

export const list = query({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);

        let labels;

        // Apply organization filtering based on user role
        if (isSuperAdmin(user)) {
            // Super admin can see all labels, optionally filtered by org
            if (args.organization_id) {
                await requireOrgAccess(ctx, args.organization_id);
                labels = await ctx.db
                    .query("labels")
                    .withIndex("by_org", (q) => q.eq("organization_id", args.organization_id))
                    .collect();
            } else {
                labels = await ctx.db.query("labels").collect();
            }
        } else {
            // All other roles can only see labels in their organization
            if (user.organization_id) {
                labels = await ctx.db
                    .query("labels")
                    .withIndex("by_org", (q) => q.eq("organization_id", user.organization_id as Id<"organizations">))
                    .collect();
            } else {
                return []; // No organization assigned
            }
        }

        // Add usage_count to each label: members currently carrying it, so an
        // archived member's labels don't inflate the figure. Each member is
        // read at most once however many labels they carry.
        const memberIsCurrent = new Map<Id<"members">, Promise<boolean>>();
        const isCurrent = (id: Id<"members">) => {
            let pending = memberIsCurrent.get(id);
            if (!pending) {
                pending = ctx.db.get(id).then((m) => !!m && !m.archived_at);
                memberIsCurrent.set(id, pending);
            }
            return pending;
        };
        const labelsWithCounts = await Promise.all(
            labels.map(async (label) => {
                const rows = await ctx.db
                    .query("member_labels")
                    .withIndex("by_label", (q) => q.eq("label_id", label._id))
                    .collect();
                const current = await Promise.all(rows.map((r) => isCurrent(r.member_id)));
                return { ...label, usage_count: current.filter(Boolean).length };
            })
        );

        return labelsWithCounts;
    },
});

export const create = mutation({
    args: {
        name: v.string(),
        description: v.optional(v.string()),
        category: v.optional(v.string()),
        color: v.string(),
        is_system_label: v.boolean(),
        organization_id: v.optional(v.id("organizations")),
        created_by: v.optional(v.string()),
        created_by_name: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Labels are shared across the church, so only administrators make
        // them, as they already are the only ones who can edit or remove them.
        const user = await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        const labelId = await ctx.db.insert("labels", {
            ...args,
            organization_id: orgId ?? args.organization_id,
            is_active: true,
        });

        // Audit log
        await ctx.runMutation(internal.audit.logEvent, {
            action: "label.created",
            entity_type: "label",
            entity_id: labelId,
            entity_name: args.name,
            performed_by: user._id,
            performed_by_name: user.name || "Unknown",
            performed_by_role: user.role,
            organization_id: orgId ?? args.organization_id,
            changes: { name: args.name, color: args.color, category: args.category },
        });

        return labelId;
    },
});

export const update = mutation({
    args: {
        id: v.id("labels"),
        updates: v.object({
            name: v.optional(v.string()),
            description: v.optional(v.string()),
            category: v.optional(v.string()),
            color: v.optional(v.string()),
            is_active: v.optional(v.boolean()),
        }),
    },
    handler: async (ctx, args) => {
        const user = await requireOrgAdmin(ctx);
        const existing = await ctx.db.get(args.id);
        if (!existing) throw new Error("Label not found");
        if (existing.organization_id) {
            await requireOrgAccess(ctx, existing.organization_id);
        }

        // Track changes
        const changes: Record<string, { before: any; after: any }> = {};
        if (args.updates.name && args.updates.name !== existing.name) {
            changes.name = { before: existing.name, after: args.updates.name };
        }
        if (args.updates.color && args.updates.color !== existing.color) {
            changes.color = { before: existing.color, after: args.updates.color };
        }
        if (args.updates.description !== undefined && args.updates.description !== existing.description) {
            changes.description = { before: existing.description, after: args.updates.description };
        }
        if (args.updates.category !== undefined && args.updates.category !== existing.category) {
            changes.category = { before: existing.category, after: args.updates.category };
        }
        if (args.updates.is_active !== undefined && args.updates.is_active !== existing.is_active) {
            changes.is_active = { before: existing.is_active, after: args.updates.is_active };
        }

        await ctx.db.patch(args.id, args.updates);

        // Audit log
        if (Object.keys(changes).length > 0) {
            await ctx.runMutation(internal.audit.logEvent, {
                action: "label.updated",
                entity_type: "label",
                entity_id: args.id,
                entity_name: existing.name,
                performed_by: user._id,
                performed_by_name: user.name || "Unknown",
                performed_by_role: user.role,
                organization_id: existing.organization_id,
                changes,
            });
        }
    },
});

export const remove = mutation({
    args: { id: v.id("labels") },
    handler: async (ctx, args) => {
        const user = await requireOrgAdmin(ctx);
        const existing = await ctx.db.get(args.id);
        if (!existing) throw new Error("Label not found");
        if (existing.organization_id) {
            await requireOrgAccess(ctx, existing.organization_id);
        }
        // Find all member_labels using this label and remove them
        const links = await ctx.db
            .query("member_labels")
            .withIndex("by_label", (q) => q.eq("label_id", args.id))
            .collect();

        for (const link of links) {
            await ctx.db.delete(link._id);
        }

        // Audit log
        await ctx.runMutation(internal.audit.logEvent, {
            action: "label.deleted",
            entity_type: "label",
            entity_id: args.id,
            entity_name: existing.name,
            performed_by: user._id,
            performed_by_name: user.name || "Unknown",
            performed_by_role: user.role,
            organization_id: existing.organization_id,
            changes: { deleted: existing.name, color: existing.color },
        });

        await ctx.db.delete(args.id);
    },
});

/**
 * Who may put labels on a member: administrators for anyone in the church,
 * leaders for the members they look after. Plain members can't.
 */
async function requireLabelAccessTo(ctx: MutationCtx, memberIds: Id<"members">[]) {
    await requireUser(ctx);
    const scope = await resolveManagedMemberIds(ctx);
    if (isOrgWideScope(scope)) return;
    for (const id of memberIds) {
        if (!scope.has(id)) throw new Error("Forbidden: you can only label the members you look after");
    }
}

export const toggleMemberLabel = mutation({
    args: {
        member_id: v.id("members"),
        label_id: v.id("labels"),
        assigned_by: v.optional(v.string()),
        assigned_by_name: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireLabelAccessTo(ctx, [args.member_id]);
        const member = await ctx.db.get(args.member_id);
        const label = await ctx.db.get(args.label_id);
        if (!member || !label) throw new Error("Member or label not found");
        if (member.organization_id) await requireOrgAccess(ctx, member.organization_id);
        if (label.organization_id) await requireOrgAccess(ctx, label.organization_id);

        const existing = await ctx.db
            .query("member_labels")
            .withIndex("by_member", (q) => q.eq("member_id", args.member_id))
            .filter((q) => q.eq(q.field("label_id"), args.label_id))
            .first();

        if (existing) {
            await ctx.db.delete(existing._id);
            return { action: "removed" };
        } else {
            await ctx.db.insert("member_labels", {
                member_id: args.member_id,
                label_id: args.label_id,
                assigned_by: args.assigned_by,
                assigned_by_name: args.assigned_by_name,
            });
            return { action: "added" };
        }
    },
});

export const getByMember = query({
    args: { member_id: v.id("members") },
    handler: async (ctx, args) => {
        await requireUser(ctx);
        const member = await ctx.db.get(args.member_id);
        if (member?.organization_id) {
            await requireOrgAccess(ctx, member.organization_id);
        }
        const links = await ctx.db
            .query("member_labels")
            .withIndex("by_member", (q) => q.eq("member_id", args.member_id))
            .collect();

        const labelIds = links.map((l) => l.label_id);
        const labels = [];
        for (const id of labelIds) {
            const label = await ctx.db.get(id);
            if (label) labels.push(label);
        }
        return labels;
    },
});

export const bulk = mutation({
    args: {
        member_ids: v.array(v.id("members")),
        label_ids: v.array(v.id("labels")),
        operation: v.union(v.literal("add"), v.literal("remove"), v.literal("replace")),
        assigned_by: v.optional(v.string()),
        assigned_by_name: v.optional(v.string()),
        notes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireLabelAccessTo(ctx, args.member_ids);
        for (const memberId of args.member_ids) {
            const member = await ctx.db.get(memberId);
            if (member?.organization_id) {
                await requireOrgAccess(ctx, member.organization_id);
            }
        }
        for (const labelId of args.label_ids) {
            const label = await ctx.db.get(labelId);
            if (label?.organization_id) {
                await requireOrgAccess(ctx, label.organization_id);
            }
        }
        if (args.operation === "replace") {
            // Remove ALL existing labels for these members first
            for (const memberId of args.member_ids) {
                const links = await ctx.db
                    .query("member_labels")
                    .withIndex("by_member", (q) => q.eq("member_id", memberId))
                    .collect();
                for (const link of links) {
                    await ctx.db.delete(link._id);
                }
            }

            // Then add new ones
            for (const memberId of args.member_ids) {
                for (const labelId of args.label_ids) {
                    await ctx.db.insert("member_labels", {
                        member_id: memberId,
                        label_id: labelId,
                        assigned_by: args.assigned_by,
                        assigned_by_name: args.assigned_by_name,
                    });
                }
            }
        } else if (args.operation === "add") {
            for (const memberId of args.member_ids) {
                for (const labelId of args.label_ids) {
                    // Check if already exists
                    const existing = await ctx.db
                        .query("member_labels")
                        .withIndex("by_member", (q) => q.eq("member_id", memberId))
                        .filter((q) => q.eq(q.field("label_id"), labelId))
                        .first();

                    if (!existing) {
                        await ctx.db.insert("member_labels", {
                            member_id: memberId,
                            label_id: labelId,
                            assigned_by: args.assigned_by,
                            assigned_by_name: args.assigned_by_name,
                        });
                    }
                }
            }
        } else if (args.operation === "remove") {
            for (const memberId of args.member_ids) {
                for (const labelId of args.label_ids) {
                    const existing = await ctx.db
                        .query("member_labels")
                        .withIndex("by_member", (q) => q.eq("member_id", memberId))
                        .filter((q) => q.eq(q.field("label_id"), labelId))
                        .first();

                    if (existing) {
                        await ctx.db.delete(existing._id);
                    }
                }
            }
        }
    },
});
