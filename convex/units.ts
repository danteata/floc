import { v } from "convex/values";
import { query, mutation, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireOrgAccess, requireOrgAdmin, requireUser, resolveOrgId, getUserSafe, normalizeOrgId } from "./auth";
import { setPrimaryLeaderInternal } from "./unit_admins";
import { internal } from "./_generated/api";

// Utility functions for hierarchical operations
export const buildPath = (parentPath: string, unitName: string): string => {
    const cleanName = unitName.toLowerCase().replace(/[^a-z0-9\-_]/g, '-');
    return parentPath ? `${parentPath}/${cleanName}` : `/${cleanName}`;
};

export const getUnitDepth = (parentDepth: number): number => {
    return parentDepth + 1;
};

export const getDescendants = query({
    args: { unit_id: v.id("units") },
    handler: async (ctx, args) => {
        const unit = await ctx.db.get(args.unit_id);
        if (!unit) return [];
        await requireOrgAccess(ctx, unit.organization_id);

        const descendants = await ctx.db
            .query("units")
            .withIndex("by_path", (q) => q.gte("path", unit.path + "/").lt("path", unit.path + "0"))
            .collect();

        return descendants;
    },
});

export const getAncestors = query({
    args: { unit_id: v.id("units") },
    handler: async (ctx, args) => {
        const unit = await ctx.db.get(args.unit_id);
        if (!unit || !unit.parent_unit_id) return [];
        await requireOrgAccess(ctx, unit.organization_id);

        const ancestors = [];
        let currentParentId: Id<"units"> | undefined = unit.parent_unit_id;

        while (currentParentId) {
            const parent: any = await ctx.db.get(currentParentId);
            if (!parent) break;
            ancestors.unshift(parent);
            currentParentId = parent.parent_unit_id;
        }

        return ancestors;
    },
});

export const getChildren = query({
    args: { unit_id: v.id("units") },
    handler: async (ctx, args) => {
        const parent = await ctx.db.get(args.unit_id);
        if (parent?.organization_id) {
            await requireOrgAccess(ctx, parent.organization_id);
        }
        return await ctx.db
            .query("units")
            .withIndex("by_parent", (q) => q.eq("parent_unit_id", args.unit_id))
            .collect();
    },
});

export const list = query({
    args: {},
    handler: async (ctx) => {
        const user = await getUserSafe(ctx);
        if (!user) return []; // Return empty array if user doesn't exist
        if (user.role === "super_admin") {
            return await ctx.db.query("units").collect();
        }
        // Use normalizeOrgId directly (not resolveOrgId) so a user whose
        // organization_id hasn't been attached yet (e.g. mid-onboarding)
        // gets an empty list instead of a thrown error.
        const orgId = normalizeOrgId(ctx, user.organization_id);
        if (!orgId) return [];
        return await ctx.db
            .query("units")
            .withIndex("by_org", (q) => q.eq("organization_id", orgId))
            .collect();
    },
});

export const listByOrg = query({
    args: { organization_id: v.id("organizations") },
    handler: async (ctx, args) => {
        await requireOrgAccess(ctx, args.organization_id);
        return await ctx.db
            .query("units")
            .withIndex("by_org", q => q.eq("organization_id", args.organization_id))
            .collect();
    },
});

export const listByType = query({
    args: {
        organization_id: v.id("organizations"),
        type: v.string()
    },
    handler: async (ctx, args) => {
        await requireOrgAccess(ctx, args.organization_id);
        return await ctx.db
            .query("units")
            .withIndex("by_org_type", q => q.eq("organization_id", args.organization_id).eq("type", args.type))
            .collect();
    },
});



export const getRootUnits = query({
    args: { organization_id: v.id("organizations") },
    handler: async (ctx, args) => {
        await requireOrgAccess(ctx, args.organization_id);
        const allUnits = await ctx.db
            .query("units")
            .withIndex("by_org", q => q.eq("organization_id", args.organization_id))
            .collect();
        return allUnits.filter(u => u.depth === 0 || u.depth === undefined);
    },
});

export const create = mutation({
    args: {
        name: v.string(),
        description: v.optional(v.string()),
        organization_id: v.id("organizations"),
        parent_unit_id: v.optional(v.id("units")),
        type: v.string(), // 'administrative', 'functional', 'geographic'
        category: v.optional(v.string()),
        leader_id: v.optional(v.id("members")),
        active: v.boolean(),
        address: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        country: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const actor = await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) throw new Error("Organization not set");
        // Get parent unit for path and depth calculation
        let parentPath = "";
        let depth = 0;

        if (args.parent_unit_id) {
            const parent = await ctx.db.get(args.parent_unit_id);
            if (parent && parent.path && parent.depth !== undefined) {
                if (parent.organization_id !== orgId) {
                    throw new Error("Parent unit org mismatch");
                }
                parentPath = parent.path;
                depth = getUnitDepth(parent.depth);
            }
        }

        const path = buildPath(parentPath, args.name);

        const unitId = await ctx.db.insert("units", {
            ...args,
            organization_id: orgId,
            depth,
            path,
        });

        // Register the initial leader as the unit's primary admin.
        if (args.leader_id) {
            await setPrimaryLeaderInternal(ctx, {
                unitId,
                memberId: args.leader_id,
                organizationId: orgId,
                addedBy: actor.clerk_user_id,
            });
        }

        return unitId;
    },
});

export const update = mutation({
    args: {
        id: v.id("units"),
        updates: v.object({
            name: v.optional(v.string()),
            description: v.optional(v.string()),
            parent_unit_id: v.optional(v.id("units")),
            type: v.optional(v.string()),
            category: v.optional(v.string()),
            leader_id: v.optional(v.id("members")),
            active: v.optional(v.boolean()),
            address: v.optional(v.string()),
            city: v.optional(v.string()),
            state: v.optional(v.string()),
            country: v.optional(v.string()),
            latitude: v.optional(v.number()),
            longitude: v.optional(v.number()),
            plus_code: v.optional(v.string()),
        }),
    },
    handler: async (ctx, args) => {
        const { id, updates } = args;
        const actor = await requireOrgAdmin(ctx);
        const unit = await ctx.db.get(id);
        if (!unit) throw new Error("Unit not found");
        await requireOrgAccess(ctx, unit.organization_id);
        if (updates.parent_unit_id) {
            if (updates.parent_unit_id === id) {
                throw new Error("A unit cannot be its own parent");
            }
            const parent = await ctx.db.get(updates.parent_unit_id);
            if (!parent || parent.organization_id !== unit.organization_id) {
                throw new Error("Parent unit org mismatch");
            }
            // Reparenting via update must guard against cycles just like
            // moveUnit does — otherwise a unit can be made a child of its own
            // descendant, corrupting every path/depth beneath it.
            const wouldCreateCycle = await checkForCycle(ctx, id, updates.parent_unit_id);
            if (wouldCreateCycle) {
                throw new Error("Moving this unit would create a circular reference");
            }
        }

        const leaderChanged = "leader_id" in updates && updates.leader_id !== unit.leader_id;

        await updateUnitWithPathRecalculation(ctx, id, updates);

        // Keep unit_admins in sync when the primary leader changes.
        if (leaderChanged) {
            if (updates.leader_id) {
                await setPrimaryLeaderInternal(ctx, {
                    unitId: id,
                    memberId: updates.leader_id,
                    organizationId: unit.organization_id,
                    addedBy: actor.clerk_user_id,
                });
            } else if (unit.leader_id) {
                // Leader cleared: keep them as an assistant admin, drop primary.
                const prev = await ctx.db
                    .query("unit_admins")
                    .withIndex("by_unit_member", (q) =>
                        q.eq("unit_id", id).eq("member_id", unit.leader_id!),
                    )
                    .first();
                if (prev) await ctx.db.patch(prev._id, { role: "admin" });
            }
        }

        return true;
    },
});

export const remove = mutation({
    args: { id: v.id("units") },
    handler: async (ctx, args) => {
        await requireOrgAdmin(ctx);
        const unit = await ctx.db.get(args.id);
        if (!unit) throw new Error("Unit not found");
        await requireOrgAccess(ctx, unit.organization_id);
        // Check if unit has children
        const children = await ctx.db
            .query("units")
            .withIndex("by_parent", (q) => q.eq("parent_unit_id", args.id))
            .collect();

        if (children.length > 0) {
            throw new Error("Cannot delete unit with child units. Move or delete children first.");
        }

        await ctx.db.delete(args.id);
        return true;
    },
});

// Helper function to update descendant paths when a unit's path changes
const updateDescendantPaths = async (
    ctx: { db: any },
    unitId: Id<"units">,
    oldPath: string,
    newPath: string
) => {
    const descendants = await ctx.db
        .query("units")
        .withIndex("by_path", (q: any) => q.gte("path", oldPath + "/").lt("path", oldPath + "0"))
        .collect();

    for (const descendant of descendants) {
        const newDescendantPath = descendant.path.replace(oldPath, newPath);
        await ctx.db.patch(descendant._id, { path: newDescendantPath });
    }
};

// Helper function to update unit with path recalculation (shared between update,
// moveUnit, and template propagation). Exported so unit_templates.ts can reuse
// the path/depth rebuild when a template's name change propagates to instances.
export const updateUnitWithPathRecalculation = async (
    ctx: any,
    id: Id<"units">,
    updates: any
) => {
    // If parent or name changed, we need to update path and depth
    if (updates.parent_unit_id !== undefined || updates.name) {
        const unit = await ctx.db.get(id);
        if (!unit) throw new Error("Unit not found");

        let newParentPath = "";
        let newDepth = unit.depth ?? 0;
        let newPath = unit.path;

        if (updates.parent_unit_id !== undefined) {
            if (updates.parent_unit_id) {
                const parent = await ctx.db.get(updates.parent_unit_id);
                if (parent && parent.path && parent.depth !== undefined) {
                    newParentPath = parent.path;
                    newDepth = getUnitDepth(parent.depth);
                }
            }
            // Recalculate path with new parent and current/new name
            const unitName = updates.name || unit.name;
            newPath = buildPath(newParentPath, unitName);

            // Update all descendants' paths
            if (unit.path) {
                await updateDescendantPaths(ctx, id, unit.path, newPath);
            }
        } else if (updates.name) {
            // Only name changed, rebuild path with same parent
            if (unit.path) {
                const pathParts = unit.path.split('/');
                pathParts[pathParts.length - 1] = updates.name.toLowerCase().replace(/[^a-z0-9\-_]/g, '-');
                newPath = pathParts.join('/');

                // Update all descendants' paths
                await updateDescendantPaths(ctx, id, unit.path, newPath);
            }
        }

        // Update the unit with new path and depth
        await ctx.db.patch(id, {
            ...updates,
            path: newPath,
            depth: newDepth,
        });
    } else {
        // Simple update without path changes
        await ctx.db.patch(id, updates);
    }
};

export const moveUnit = mutation({
    args: {
        unitId: v.id("units"),
        newParentId: v.optional(v.id("units")),
    },
    handler: async (ctx, args) => {
        const { unitId, newParentId } = args;
        await requireOrgAdmin(ctx);
        const unit = await ctx.db.get(unitId);
        if (!unit) throw new Error("Unit not found");
        await requireOrgAccess(ctx, unit.organization_id);

        // Prevent circular references
        if (newParentId) {
            const parent = await ctx.db.get(newParentId);
            if (!parent || parent.organization_id !== unit.organization_id) {
                throw new Error("Parent unit org mismatch");
            }
            const wouldCreateCycle = await checkForCycle(ctx, unitId, newParentId);
            if (wouldCreateCycle) {
                throw new Error("Moving this unit would create a circular reference");
            }
        }

        // Use the helper function to properly handle path and depth recalculation
        await updateUnitWithPathRecalculation(ctx, unitId, { parent_unit_id: newParentId });

        return true;
    },
});

// Helper to check for circular references
const checkForCycle = async (
    ctx: any,
    unitId: Id<"units">,
    potentialParentId: Id<"units">
): Promise<boolean> => {
    let currentId = potentialParentId;
    while (currentId) {
        if (currentId === unitId) return true;
        const unit = await ctx.db.get(currentId);
        if (!unit) break;
        currentId = unit.parent_unit_id;
    }
    return false;
};

// Migration function to populate depth and path for existing units
export const migrateExistingUnits = mutation({
    args: { organization_id: v.id("organizations") },
    handler: async (ctx, args) => {
        await requireOrgAdmin(ctx);
        await requireOrgAccess(ctx, args.organization_id);
        // Get all units for this organization
        const units = await ctx.db
            .query("units")
            .withIndex("by_org", q => q.eq("organization_id", args.organization_id))
            .collect();

        // Group units by their parent relationships
        const unitMap = new Map(units.map(u => [u._id.toString(), u]));
        const processed = new Set<string>();

        // Process root units first (those without parent or with old division relationship)
        const rootUnits = units.filter(u => !u.parent_unit_id || u.parent_organization_type === "organization");

        for (const rootUnit of rootUnits) {
            if (processed.has(rootUnit._id.toString())) continue;

            // Set depth and path for root unit
            const path = buildPath("", rootUnit.name);
            await ctx.db.patch(rootUnit._id, {
                depth: 0,
                path,
                type: rootUnit.type || "administrative" // Default to administrative if not set
            });
            processed.add(rootUnit._id.toString());

            // Process children recursively
            await processChildren(ctx, rootUnit._id, path, 0, unitMap, processed);
        }

        return { migrated: processed.size };
    },
});

// Migration to set types for existing units based on their names/content
export const setUnitTypes = mutation({
    args: { organization_id: v.id("organizations") },
    handler: async (ctx, args) => {
        await requireOrgAdmin(ctx);
        await requireOrgAccess(ctx, args.organization_id);
        const units = await ctx.db
            .query("units")
            .withIndex("by_org", q => q.eq("organization_id", args.organization_id))
            .collect();

        const ministryKeywords = ['choir', 'worship', 'youth', 'children', 'adult', 'praise', 'music', 'ministry', 'team', 'group'];
        const adminKeywords = ['branch', 'district', 'region', 'division', 'office', 'board', 'council', 'committee'];

        let updated = 0;

        for (const unit of units) {
            let unitType = unit.type; // Keep existing type if set

            if (!unitType) {
                const name = unit.name.toLowerCase();
                const hasMinistryKeyword = ministryKeywords.some(keyword => name.includes(keyword));
                const hasAdminKeyword = adminKeywords.some(keyword => name.includes(keyword));

                if (hasMinistryKeyword && !hasAdminKeyword) {
                    unitType = 'ministry';
                } else if (hasAdminKeyword) {
                    unitType = 'administrative';
                } else {
                    // Default to administrative for organizational units
                    unitType = 'administrative';
                }

                await ctx.db.patch(unit._id, { type: unitType });
                updated++;
            }
        }

        return { updated };
    },
});

// Helper function to recursively process child units
const processChildren = async (
    ctx: any,
    parentId: any,
    parentPath: string,
    parentDepth: number,
    unitMap: Map<string, any>,
    processed: Set<string>
) => {
    // Find units that have this parent via old parent_organization_type logic
    const children = Array.from(unitMap.values()).filter(u =>
        !processed.has(u._id.toString()) &&
        ((u.parent_organization_type === "division" && u.division_id === parentId) ||
            u.parent_unit_id === parentId)
    );

    for (const child of children) {
        const childPath = buildPath(parentPath, child.name);
        const childDepth = parentDepth + 1;

        await ctx.db.patch(child._id, {
            depth: childDepth,
            path: childPath,
            parent_unit_id: parentId, // Ensure proper parent reference
            type: child.type || "administrative" // Default type
        });
        processed.add(child._id.toString());

        // Process this child's children
        await processChildren(ctx, child._id, childPath, childDepth, unitMap, processed);
    }
};

// -----------------------------------------------------------------------------
// Template inheritance (see unit_templates.ts)
// -----------------------------------------------------------------------------

// Locally customize a template-linked unit's name/description. The changed
// fields are recorded in `template_overrides` so future template edits leave
// them alone (living-link with per-field override). Backs OverrideUnitDialog.
export const overrideFromTemplate = mutation({
    args: {
        unit_id: v.id("units"),
        name: v.optional(v.string()),
        description: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireOrgAdmin(ctx);
        const unit = await ctx.db.get(args.unit_id);
        if (!unit) throw new Error("Unit not found");
        await requireOrgAccess(ctx, unit.organization_id);
        if (!unit.source_template_id) {
            throw new Error("Unit is not linked to a template");
        }

        const overrides = new Set(unit.template_overrides ?? []);
        const patch: Record<string, unknown> = {};
        if (args.name !== undefined) {
            patch.name = args.name;
            overrides.add("name");
        }
        if (args.description !== undefined) {
            patch.description = args.description;
            overrides.add("description");
        }
        if (Object.keys(patch).length === 0) return true;

        // Rebuilds path + descendants if the name changed.
        await updateUnitWithPathRecalculation(ctx, args.unit_id, patch);
        await ctx.db.patch(args.unit_id, { template_overrides: Array.from(overrides) });
        return true;
    },
});

// -----------------------------------------------------------------------------
// Merge
// -----------------------------------------------------------------------------

// Preview what a merge would move, for the confirmation dialog. Read-only.
export const mergePreview = query({
    args: { source_id: v.id("units"), target_id: v.id("units") },
    handler: async (ctx, args) => {
        const source = await ctx.db.get(args.source_id);
        const target = await ctx.db.get(args.target_id);
        if (!source || !target) return null;
        await requireOrgAccess(ctx, source.organization_id);

        const sourceMemberIds = new Set(
            (await ctx.db.query("member_units").withIndex("by_unit", (q) => q.eq("unit_id", args.source_id)).collect())
                .map((r) => r.member_id),
        );
        const targetMemberIds = new Set(
            (await ctx.db.query("member_units").withIndex("by_unit", (q) => q.eq("unit_id", args.target_id)).collect())
                .map((r) => r.member_id),
        );
        const overlap = [...sourceMemberIds].filter((id) => targetMemberIds.has(id)).length;
        const sourceAdmins = (await ctx.db.query("unit_admins").withIndex("by_unit", (q) => q.eq("unit_id", args.source_id)).collect())
            .filter((a) => a.is_active).length;
        const sourceChildren = (await ctx.db.query("units").withIndex("by_parent", (q) => q.eq("parent_unit_id", args.source_id)).collect()).length;

        return {
            sourceName: source.name,
            targetName: target.name,
            sourceMembers: sourceMemberIds.size,
            overlap,
            newMembers: sourceMemberIds.size - overlap,
            resultingMembers: targetMemberIds.size + (sourceMemberIds.size - overlap),
            sourceAdmins,
            sourceChildren,
        };
    },
});

// Merge `source` into `target`: move memberships and admins (de-duplicated),
// reparent child units, repoint event-type and automation scoping, adopt the
// source's leader if the target has none, then delete the source. No member
// data is lost — everything moves to the target. Core logic (no auth) so it can
// be unit-tested and reused; the `merge` mutation wraps it with auth + audit.
export async function mergeUnitsCore(
    ctx: MutationCtx,
    sourceId: Id<"units">,
    targetId: Id<"units">,
): Promise<{ sourceName: string; targetName: string; organizationId: Id<"organizations"> }> {
    const args = { source_id: sourceId, target_id: targetId };
    {
        if (args.source_id === args.target_id) {
            throw new Error("Cannot merge a unit into itself");
        }
        const source = await ctx.db.get(args.source_id);
        const target = await ctx.db.get(args.target_id);
        if (!source) throw new Error("Source unit not found");
        if (!target) throw new Error("Target unit not found");
        if (source.organization_id !== target.organization_id) {
            throw new Error("Units belong to different organizations");
        }
        // Merging into a unit nested under the source would orphan/cycle the tree.
        if (source.path && target.path?.startsWith(source.path + "/")) {
            throw new Error("A unit can't be merged into one of its own sub-units. Merge them the other way round.");
        }

        // 1) Memberships → target, de-duplicated by member.
        const targetMemberIds = new Set(
            (await ctx.db.query("member_units").withIndex("by_unit", (q) => q.eq("unit_id", args.target_id)).collect())
                .map((r) => r.member_id),
        );
        const sourceMemberships = await ctx.db.query("member_units").withIndex("by_unit", (q) => q.eq("unit_id", args.source_id)).collect();
        for (const mu of sourceMemberships) {
            if (targetMemberIds.has(mu.member_id)) {
                await ctx.db.delete(mu._id);
            } else {
                await ctx.db.patch(mu._id, { unit_id: args.target_id });
                targetMemberIds.add(mu.member_id);
            }
        }

        // 2) Admins → target, de-duplicated; never create a second leader.
        const targetAdmins = await ctx.db.query("unit_admins").withIndex("by_unit", (q) => q.eq("unit_id", args.target_id)).collect();
        const targetAdminMemberIds = new Set(targetAdmins.map((a) => a.member_id));
        const targetHasLeader = !!target.leader_id || targetAdmins.some((a) => a.is_active && a.role === "leader");
        const sourceAdmins = await ctx.db.query("unit_admins").withIndex("by_unit", (q) => q.eq("unit_id", args.source_id)).collect();
        for (const a of sourceAdmins) {
            if (targetAdminMemberIds.has(a.member_id)) {
                await ctx.db.delete(a._id);
            } else {
                const role = a.role === "leader" && targetHasLeader ? "admin" : a.role;
                await ctx.db.patch(a._id, { unit_id: args.target_id, role });
                targetAdminMemberIds.add(a.member_id);
            }
        }

        // 3) Adopt source's leader if the target has none.
        if (!target.leader_id && source.leader_id) {
            await ctx.db.patch(args.target_id, { leader_id: source.leader_id });
        }

        // 4) Reparent the tree. If the target was itself a child of the source,
        // move it up into the source's place first so the children below land
        // at the right path.
        if (target.parent_unit_id === args.source_id) {
            await updateUnitWithPathRecalculation(ctx, args.target_id, { parent_unit_id: source.parent_unit_id });
        }
        const children = await ctx.db.query("units").withIndex("by_parent", (q) => q.eq("parent_unit_id", args.source_id)).collect();
        for (const child of children) {
            if (child._id === args.target_id) continue;
            await updateUnitWithPathRecalculation(ctx, child._id, { parent_unit_id: args.target_id });
        }

        // 5) Repoint event-type and automation unit scoping (de-duplicated).
        const repoint = (ids: Id<"units">[] | undefined): Id<"units">[] | null => {
            if (!ids || !ids.includes(args.source_id)) return null;
            return Array.from(new Set(ids.map((id) => (id === args.source_id ? args.target_id : id))));
        };
        for (const et of await ctx.db.query("event_types").collect()) {
            const next = repoint(et.unit_ids);
            if (next) await ctx.db.patch(et._id, { unit_ids: next });
        }
        for (const rule of await ctx.db.query("automation_rules").withIndex("by_org", (q) => q.eq("organization_id", source.organization_id)).collect()) {
            const next = repoint(rule.unit_ids);
            if (next) await ctx.db.patch(rule._id, { unit_ids: next });
        }

        // 6) Delete the now-empty source unit.
        await ctx.db.delete(args.source_id);
        return {
            sourceName: source.name,
            targetName: target.name,
            organizationId: source.organization_id,
        };
    }
}

export const merge = mutation({
    args: { source_id: v.id("units"), target_id: v.id("units") },
    handler: async (ctx, args) => {
        const actor = await requireOrgAdmin(ctx);
        const source = await ctx.db.get(args.source_id);
        if (!source) throw new Error("Source unit not found");
        await requireOrgAccess(ctx, source.organization_id);

        const result = await mergeUnitsCore(ctx, args.source_id, args.target_id);

        await ctx.runMutation(internal.audit.logEvent, {
            action: "unit.merged",
            entity_type: "unit",
            entity_id: args.target_id,
            entity_name: result.targetName,
            performed_by: actor.clerk_user_id,
            performed_by_name: actor.name || actor.email || "Unknown",
            performed_by_role: actor.role,
            organization_id: result.organizationId,
            changes: { merged: { from: { id: args.source_id, name: result.sourceName }, into: { id: args.target_id, name: result.targetName } } },
        });

        return true;
    },
});

// Drop all local overrides and re-pull the template's current values.
export const resetToTemplate = mutation({
    args: { unit_id: v.id("units") },
    handler: async (ctx, args) => {
        await requireOrgAdmin(ctx);
        const unit = await ctx.db.get(args.unit_id);
        if (!unit) throw new Error("Unit not found");
        await requireOrgAccess(ctx, unit.organization_id);
        if (!unit.source_template_id) {
            throw new Error("Unit is not linked to a template");
        }
        const template = await ctx.db.get(unit.source_template_id);
        if (!template) throw new Error("Template not found");

        await updateUnitWithPathRecalculation(ctx, args.unit_id, {
            name: template.name,
            description: template.description,
            type: template.type,
            category: template.category,
        });
        await ctx.db.patch(args.unit_id, { template_overrides: [] });
        return true;
    },
});
