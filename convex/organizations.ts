
import { v } from "convex/values";
import { query, mutation, internalMutation, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import {
    requireOrgAccess,
    requireOrgAdmin,
    requireSuperAdmin,
    requireUser,
    resolveOrgId,
    isSuperAdmin,
    isOrgAdmin,
    normalizeOrgId,
    isDescendantOrg,
    getDescendantOrgIds,
    getAncestorOrgIds,
} from "./auth";
import { internal } from "./_generated/api";
import {
    provisionAncestorTemplatesToOrg,
    detachTemplatesOwnedBy,
} from "./unit_templates";
import { deriveBrand, isBrandHex } from "./lib/theme/brand";
import { DEFAULT_BRAND_HEX, brandPreset } from "./lib/theme/presets";
import { appError, invalidArgument } from "./lib/errors";
import { requireFlag } from "./lib/flags/server";
import { publicBrandHex } from "./lib/theme/publicBrand";

export const list = query({
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_user_id", identity.subject))
            .unique();

        if (!user) return []; // User not synced yet, return empty array

        if (isSuperAdmin(user)) {
            return await ctx.db.query("organizations").collect();
        }
        if (!user.organization_id) return [];
        const orgId = await resolveOrgId(ctx);
        if (!orgId) return [];
        const org = await ctx.db.get(orgId);
        if (!org) return [];
        if (!isOrgAdmin(user)) return [org];

        // Org admins also get their descendant orgs (e.g. a parent-org admin's
        // sub-organizations) surfaced alongside their own org. Plain
        // members/unit-level roles never see beyond their own org, since
        // only org-admin-tier roles get cross-org descent (auth.ts).
        const descendantIds = await getDescendantOrgIds(ctx, orgId);
        const descendants = (
            await Promise.all(descendantIds.map((id) => ctx.db.get(id)))
        ).filter((o): o is NonNullable<typeof o> => o !== null);

        return [org, ...descendants];
    },
});

export const create = mutation({
    args: { name: v.string() },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", q => q.eq("clerk_user_id", identity.subject))
            .unique();

        if (!user) throw new Error("User not found");
        if (user.organization_id && user.role !== "super_admin") {
            throw new Error("Organization already assigned");
        }

        const orgId = await ctx.db.insert("organizations", {
            name: args.name,
            active: true,
            organization_admin_id: identity.subject,
        });
        // Path embeds the org's own id so it's a stable, collision-free
        // prefix for descendant range scans — set after insert since the id
        // doesn't exist beforehand.
        await ctx.db.patch(orgId, { depth: 0, path: "/" + orgId });

        // Create initial member
        await ctx.db.insert("members", {
            name: user.name || identity.name || "Admin",
            email: user.email,
            organization_id: orgId,
            status: "active",
        });

        // Update user
        await ctx.db.patch(user._id, {
            organization_id: orgId,
            role: "organization_admin", // Ensure they are admin of this org
        });

        return orgId;
    },
});

// Attach (or detach, with parentOrganizationId: null) an org under another in
// the org tree — e.g. linking an existing org under a parent org that signed up
// later. Gated to super_admin: this changes who can read/write the
// sub-organization's data, so it's a deliberate action, not self-serve.
export const setParentOrganization = mutation({
    args: {
        organization_id: v.id("organizations"),
        parent_organization_id: v.union(v.id("organizations"), v.null()),
    },
    handler: async (ctx, args) => {
        await requireSuperAdmin(ctx);
        const formerAncestors = await getAncestorOrgIds(ctx, args.organization_id);
        const subtreeBefore = [
            args.organization_id,
            ...(await getDescendantOrgIds(ctx, args.organization_id)),
        ];
        await applyOrgParentChange(
            ctx,
            args.organization_id,
            args.parent_organization_id ?? null,
        );
        await syncTemplatesOnParentChange(ctx, args.organization_id, formerAncestors, subtreeBefore);
        return true;
    },
});

// Core re-parenting logic shared by every attach/detach path (super_admin
// setParentOrganization, self-join via invite code, parent-org remove-sub-org,
// leave-parent). Validates against cycles, recomputes this
// org's path/depth, and cascades path rewrites to all its descendants.
async function applyOrgParentChange(
    ctx: MutationCtx,
    orgId: Id<"organizations">,
    parentOrgId: Id<"organizations"> | null,
): Promise<void> {
    const org = await ctx.db.get(orgId);
    if (!org) throw new Error("Organization not found");

    let newParentPath = "";
    let newDepth = 0;

    if (parentOrgId) {
        if (parentOrgId === orgId) {
            throw new Error("An organization cannot be its own parent");
        }
        const parent = await ctx.db.get(parentOrgId);
        if (!parent) throw new Error("Parent organization not found");

        const wouldCreateCycle = await orgIsAncestorOf(ctx, orgId, parentOrgId);
        if (wouldCreateCycle) {
            throw new Error("This would create a circular organization hierarchy");
        }

        newParentPath = parent.path ?? "/" + parent._id;
        newDepth = (parent.depth ?? 0) + 1;
    }

    const oldPath = org.path ?? "/" + org._id;
    const newPath = newParentPath + "/" + orgId;

    await ctx.db.patch(orgId, {
        parent_organization_id: parentOrgId ?? undefined,
        path: newPath,
        depth: newDepth,
    });

    if (oldPath !== newPath) {
        await updateDescendantOrgPaths(ctx, oldPath, newPath);
    }
}

// Keep template inheritance consistent when an org's parent changes. Capture
// `formerAncestors` and `subtreeBefore` BEFORE calling applyOrgParentChange,
// then call this after: instances inheriting from ancestors the org no longer
// has are detached; cascade templates from the new ancestor chain are
// provisioned into the org and every descendant. Handles attach, detach, and
// move uniformly.
async function syncTemplatesOnParentChange(
    ctx: MutationCtx,
    orgId: Id<"organizations">,
    formerAncestors: Id<"organizations">[],
    subtreeBefore: Id<"organizations">[],
): Promise<void> {
    const newAncestors = new Set(await getAncestorOrgIds(ctx, orgId));
    const removed = formerAncestors.filter((a) => !newAncestors.has(a));
    await detachTemplatesOwnedBy(ctx, subtreeBefore, removed);

    const subtreeNow = [orgId, ...(await getDescendantOrgIds(ctx, orgId))];
    for (const id of subtreeNow) {
        await provisionAncestorTemplatesToOrg(ctx, id);
    }
}

// True when `candidateAncestorId` is `orgId` itself or already sits above it
// in the org tree — used to reject re-parenting moves that would create a
// cycle (mirrors units.ts:checkForCycle, one level up).
async function orgIsAncestorOf(
    ctx: MutationCtx,
    orgId: Id<"organizations">,
    candidateAncestorId: Id<"organizations">,
): Promise<boolean> {
    let cursorId: Id<"organizations"> | undefined = candidateAncestorId;
    while (cursorId) {
        if (cursorId === orgId) return true;
        const cursor: Doc<"organizations"> | null = await ctx.db.get(cursorId);
        if (!cursor) break;
        cursorId = cursor.parent_organization_id;
    }
    return false;
}

// Rewrite the `path` of every descendant org when an ancestor's path changes
// (mirrors units.ts:updateDescendantPaths, one level up).
async function updateDescendantOrgPaths(
    ctx: MutationCtx,
    oldPath: string,
    newPath: string,
): Promise<void> {
    const descendants = await ctx.db
        .query("organizations")
        .withIndex("by_path", (q) =>
            q.gte("path", oldPath + "/").lt("path", oldPath + "0"),
        )
        .collect();

    for (const descendant of descendants) {
        if (!descendant.path) continue;
        const rewritten = newPath + descendant.path.slice(oldPath.length);
        await ctx.db.patch(descendant._id, { path: rewritten });
    }
}

// One-off backfill: set depth 0 / path "/{_id}" on every org predating the
// org-tree fields. Safe to run repeatedly (skips orgs that already have a
// path). Run once after deploy: `npx convex run organizations:backfillPaths`.
export const backfillPaths = internalMutation({
    args: {},
    handler: async (ctx) => {
        const orgs = await ctx.db.query("organizations").collect();
        let updated = 0;
        for (const org of orgs) {
            if (org.path) continue;
            await ctx.db.patch(org._id, { depth: 0, path: "/" + org._id });
            updated++;
        }
        return { updated };
    },
});

// --- Self-serve org linking (invite-code flow) ------------------------------

// Human-friendly code charset: no ambiguous 0/O/1/I.
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
    let suffix = "";
    for (let i = 0; i < 5; i++) {
        suffix += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
    }
    return "ORG-" + suffix;
}

function normalizeInviteCode(code: string): string {
    return code.trim().toUpperCase();
}

// Create (or rotate) this org's invite code. Rotating invalidates the previous
// code. Org-admin only — it's the key another org uses to link under this one.
export const generateInviteCode = mutation({
    args: {},
    handler: async (ctx) => {
        const user = await requireOrgAdmin(ctx);
        const orgId = normalizeOrgId(ctx, user.organization_id);
        if (!orgId) throw new Error("Organization not set");

        let code = generateCode();
        for (let attempt = 0; attempt < 10; attempt++) {
            const clash = await ctx.db
                .query("organizations")
                .withIndex("by_invite_code", (q) => q.eq("invite_code", code))
                .unique();
            if (!clash) break;
            code = generateCode();
        }

        await ctx.db.patch(orgId, { invite_code: code });
        return { code };
    },
});

// Resolve an invite code to the parent org it belongs to, for the joining
// admin's confirmation screen. Returns null for an unknown code.
export const getOrganizationByInviteCode = query({
    args: { code: v.string() },
    handler: async (ctx, args) => {
        await requireUser(ctx);
        const code = normalizeInviteCode(args.code);
        if (!code) return null;
        const parent = await ctx.db
            .query("organizations")
            .withIndex("by_invite_code", (q) => q.eq("invite_code", code))
            .unique();
        if (!parent) return null;
        return { _id: parent._id, name: parent.name };
    },
});

// An org admin redeems another org's invite code to link THEIR OWN org under
// it. Consent is inherent: only an admin of the joining org can do this, and
// they always attach their own org (never an arbitrary id), so a leaked code
// can't pull in an org the holder doesn't run.
export const joinOrganizationByCode = mutation({
    args: { code: v.string() },
    handler: async (ctx, args) => {
        const user = await requireOrgAdmin(ctx);
        const myOrgId = normalizeOrgId(ctx, user.organization_id);
        if (!myOrgId) throw new Error("Organization not set");

        const code = normalizeInviteCode(args.code);
        const parent = await ctx.db
            .query("organizations")
            .withIndex("by_invite_code", (q) => q.eq("invite_code", code))
            .unique();
        if (!parent) throw new Error("Invalid or expired invite code");
        if (parent._id === myOrgId) {
            throw new Error("You can't join your own organization");
        }

        const myOrg = await ctx.db.get(myOrgId);
        if (myOrg?.parent_organization_id) {
            throw new Error(
                "Your organization is already linked to a parent. Leave it before joining another.",
            );
        }

        const subtreeBefore = [myOrgId, ...(await getDescendantOrgIds(ctx, myOrgId))];
        await applyOrgParentChange(ctx, myOrgId, parent._id);
        await syncTemplatesOnParentChange(ctx, myOrgId, [], subtreeBefore);

        await ctx.runMutation(internal.audit.logEvent, {
            action: "organization.linked_to_parent",
            entity_type: "organization",
            entity_id: myOrgId,
            entity_name: myOrg?.name ?? "Organization",
            performed_by: user.clerk_user_id,
            performed_by_name: user.name || user.email || "Unknown",
            performed_by_role: user.role,
            organization_id: myOrgId,
            changes: { parent: { after: { id: parent._id, name: parent.name } } },
        });

        return { parent: parent.name };
    },
});

// An org admin unlinks their own org from its parent org.
export const leaveParentOrganization = mutation({
    args: {},
    handler: async (ctx) => {
        const user = await requireOrgAdmin(ctx);
        const myOrgId = normalizeOrgId(ctx, user.organization_id);
        if (!myOrgId) throw new Error("Organization not set");

        const myOrg = await ctx.db.get(myOrgId);
        if (!myOrg?.parent_organization_id) return { left: false };

        const formerAncestors = await getAncestorOrgIds(ctx, myOrgId);
        const subtreeBefore = [myOrgId, ...(await getDescendantOrgIds(ctx, myOrgId))];
        await applyOrgParentChange(ctx, myOrgId, null);
        await syncTemplatesOnParentChange(ctx, myOrgId, formerAncestors, subtreeBefore);

        await ctx.runMutation(internal.audit.logEvent, {
            action: "organization.unlinked_from_parent",
            entity_type: "organization",
            entity_id: myOrgId,
            entity_name: myOrg.name,
            performed_by: user.clerk_user_id,
            performed_by_name: user.name || user.email || "Unknown",
            performed_by_role: user.role,
            organization_id: myOrgId,
            changes: { parent: { before: { id: myOrg.parent_organization_id } } },
        });

        return { left: true };
    },
});

// A parent-org admin removes a sub-organization from their tree. The caller
// must be an admin whose org is an ancestor of the sub-org (or super_admin).
export const removeSubOrganization = mutation({
    args: { organization_id: v.id("organizations") },
    handler: async (ctx, args) => {
        const user = await requireOrgAdmin(ctx);
        const myOrgId = normalizeOrgId(ctx, user.organization_id);

        if (!isSuperAdmin(user)) {
            if (!myOrgId) throw new Error("Organization not set");
            const ok = await isDescendantOrg(ctx, myOrgId, args.organization_id);
            if (!ok) throw new Error("Forbidden");
        }

        const subOrg = await ctx.db.get(args.organization_id);
        if (!subOrg) throw new Error("Organization not found");

        const formerAncestors = await getAncestorOrgIds(ctx, args.organization_id);
        const subtreeBefore = [
            args.organization_id,
            ...(await getDescendantOrgIds(ctx, args.organization_id)),
        ];
        await applyOrgParentChange(ctx, args.organization_id, null);
        await syncTemplatesOnParentChange(ctx, args.organization_id, formerAncestors, subtreeBefore);

        await ctx.runMutation(internal.audit.logEvent, {
            action: "organization.sub_org_removed",
            entity_type: "organization",
            entity_id: args.organization_id,
            entity_name: subOrg.name,
            performed_by: user.clerk_user_id,
            performed_by_name: user.name || user.email || "Unknown",
            performed_by_role: user.role,
            organization_id: myOrgId ?? args.organization_id,
            changes: { sub_organization: { before: { id: args.organization_id, name: subOrg.name } } },
        });

        return true;
    },
});

// The parent org the caller's own org is linked under, if any. An org admin
// can always learn which parent they're under, even though it sits above them
// and isn't in their accessible-orgs list.
export const getParentOrganization = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;
        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_user_id", identity.subject))
            .unique();
        if (!user?.organization_id) return null;
        const orgId = ctx.db.normalizeId("organizations", user.organization_id);
        if (!orgId) return null;
        const org = await ctx.db.get(orgId);
        if (!org?.parent_organization_id) return null;
        const parent = await ctx.db.get(org.parent_organization_id);
        return parent ? { _id: parent._id, name: parent.name } : null;
    },
});

export const getById = query({
    args: { id: v.id("organizations") },
    handler: async (ctx, args) => {
        await requireOrgAccess(ctx, args.id);
        return await ctx.db.get(args.id);
    },
});

/**
 * Deliberately public (no auth) — the only org data the public /give giving
 * link and its checkout action need: enough to render "Giving to <name>" and
 * to confirm the org can currently accept gifts. Nothing else from the
 * organizations table is exposed here.
 */
export const getPublicGivingInfo = query({
    args: { id: v.id("organizations") },
    handler: async (ctx, args) => {
        const org = await ctx.db.get(args.id);
        if (!org) return null;
        return {
            name: org.name,
            active: org.active !== false,
            brand_hex: await publicBrandHex(ctx, args.id, org),
        };
    },
});

export const current = query({
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_user_id", identity.subject))
            .unique();

        if (!user) return null; // User not synced yet, return null instead of throwing
        if (!user.organization_id) return null;
        return await ctx.db.get(user.organization_id as Id<"organizations">);
    },
});

// The org whose data the UI should currently show: the user's
// `viewing_organization_id` if set and still accessible (e.g. browsing a
// descendant sub-organization), otherwise their home org — same as `current`.
// Kept separate from `current` so settings/terminology screens that must always
// mean "my own org" (settings-dialog, terminology-management, event-dialog)
// are unaffected by browsing into a sub-organization.
export const getActiveOrganization = query({
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerk_user_id", identity.subject))
            .unique();
        if (!user) return null;

        const homeOrgId = user.organization_id
            ? ctx.db.normalizeId("organizations", user.organization_id)
            : null;

        const viewingOrgId = user.viewing_organization_id
            ? ctx.db.normalizeId("organizations", user.viewing_organization_id)
            : null;

        if (viewingOrgId && viewingOrgId !== homeOrgId) {
            try {
                await requireOrgAccess(ctx, viewingOrgId);
                const viewing = await ctx.db.get(viewingOrgId);
                if (viewing) {
                    return { ...viewing, isViewingDescendant: true };
                }
            } catch {
                // Access to the viewed org was revoked (e.g. detached from
                // its parent) — fall back to the home org below.
            }
        }

        if (!homeOrgId) return null;
        const home = await ctx.db.get(homeOrgId);
        return home ? { ...home, isViewingDescendant: false } : null;
    },
});

export const getChartData = query({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) return null;

        const organization = await ctx.db.get(orgId);
        if (!organization) return null;

        // Get all units for this organization
        const units = await ctx.db
            .query("units")
            .withIndex("by_org", (q) => q.eq("organization_id", orgId))
            .collect();

        // Get root level units (divisions/administrative units)
        const rootUnits = units.filter(u => u.depth === 0 || u.depth === undefined);

        // Get child units grouped by parent
        const childUnits = units.filter(u => u.depth !== undefined && u.depth > 0);

        const members = (await ctx.db
            .query("members")
            .withIndex("by_org_status", (q) => q.eq("organization_id", orgId).eq("status", "active"))
            .collect()
        ).filter((m) => !m.archived_at);

        // Per-unit stats: active member count (via member_units junction) and
        // the leader's display name (resolved from leader_id). Consumed by the
        // hierarchy cards.
        const memberNameById = new Map(members.map((m) => [m._id, m.name]));
        const memberCounts = await Promise.all(units.map(async (unit) => {
            const unitMembers = await ctx.db
                .query("member_units")
                .withIndex("by_unit", (q) => q.eq("unit_id", unit._id))
                .collect();

            const activeMembers = unitMembers.filter(mu => mu.is_active);
            let leaderName: string | undefined = unit.leader_id
                ? memberNameById.get(unit.leader_id)
                : undefined;
            // Leader may be archived/inactive (not in `members`); fall back to a
            // direct fetch so the card still shows a name.
            if (unit.leader_id && !leaderName) {
                const leader = await ctx.db.get(unit.leader_id);
                leaderName = leader?.name;
            }
            return {
                unit_id: unit._id,
                count: activeMembers.length,
                leaderName,
            };
        }));

        return {
            organization,
            rootUnits,
            units,
            childUnits,
            memberCounts,
            totalMembers: members.length, // Total unique members in organization
        };
    },
});



export const update = mutation({
    args: {
        id: v.id("organizations"),
        updates: v.object({
            name: v.optional(v.string()),
            active: v.optional(v.boolean()),
            level1_singular: v.optional(v.string()),
            level1_plural: v.optional(v.string()),
            level2_singular: v.optional(v.string()),
            level2_plural: v.optional(v.string()),
            level3_singular: v.optional(v.string()),
            level3_plural: v.optional(v.string()),
            level4_singular: v.optional(v.string()),
            level4_plural: v.optional(v.string()),
            currency: v.optional(v.string()),
        }),
    },
    handler: async (ctx, args) => {
        await requireOrgAdmin(ctx);
        await requireOrgAccess(ctx, args.id);
        if (args.updates.currency !== undefined && !/^[A-Z]{3}$/.test(args.updates.currency)) {
            throw new Error("Currency must be a three-letter code, such as GHS or USD.");
        }
        await ctx.db.patch(args.id, args.updates);
        return true;
    },
});

export const getTerminology = query({
    args: {
        organization_id: v.optional(v.id("organizations")),
        division_id: v.optional(v.id("divisions")),
        unit_id: v.optional(v.id("units")),
    },
    handler: async (ctx, args) => {
        await requireUser(ctx);
        // 1. Get global defaults from app_config
        const configs = await ctx.db.query("app_config").collect();
        const global: any = {};
        for (const c of configs) {
            global[c.key] = c.value;
        }

        const result: any = { ...global };

        // 2. Fetch all applicable overrides
        const overrides: any[] = [];

        if (args.organization_id) {
            await requireOrgAccess(ctx, args.organization_id);
            const orgTerm = await ctx.db
                .query("terminologies")
                .withIndex("by_org", q => q.eq("organization_id", args.organization_id!))
                .filter(q => q.eq("level", "organization"))
                .first();
            if (orgTerm) overrides.push(orgTerm);

            // Also check the organization table itself for legacy fields
            const org = await ctx.db.get(args.organization_id);
            if (org) {
                if (org.level1_singular) result.division_term = org.level1_singular;
                if (org.level1_plural) result.division_term_plural = org.level1_plural;
                if (org.level3_singular) result.unit_term = org.level3_singular;
                if (org.level3_plural) result.unit_term_plural = org.level3_plural;
                if (org.level4_singular) result.sub_unit_term = org.level4_singular;
                if (org.level4_plural) result.sub_unit_term_plural = org.level4_plural;
            }
        }

        if (args.division_id) {
            await requireSuperAdmin(ctx);
            const divTerm = await ctx.db
                .query("terminologies")
                .withIndex("by_division", q => q.eq("division_id", args.division_id!))
                .first();
            if (divTerm) overrides.push(divTerm);
        }

        if (args.unit_id) {
            const unit = await ctx.db.get(args.unit_id);
            if (unit?.organization_id) {
                await requireOrgAccess(ctx, unit.organization_id);
            }
            const unitTerm = await ctx.db
                .query("terminologies")
                .withIndex("by_unit", q => q.eq("unit_id", args.unit_id!))
                .first();
            if (unitTerm) overrides.push(unitTerm);
        }


        // 3. Apply overrides from least specific to most specific
        // Actually, the array is currently [org, division, unit, subunit] which is exactly what we want
        for (const override of overrides) {
            const fields = [
                'unit_term', 'unit_term_plural', 'unit_leader_term',
                'division_term', 'division_term_plural', 'division_leader_term'
            ];
            for (const field of fields) {
                if (override[field]) {
                    result[field] = override[field];
                }
            }
        }

        return result;
    },
});

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

/**
 * An organization's brand colour.
 *
 * ## Where it is delivered from
 *
 * The app reads `getTheme`, org-scoped like every other setting. The public
 * pages — giving, check-in, a shared list — get their brand inside the query
 * they are ALREADY making against their token or organization id, rather than
 * from a public endpoint keyed by organization.
 *
 * That is a deliberate difference from the obvious design. An unauthenticated
 * `/theme?organization=…` works, and it costs an endpoint that confirms whether
 * an organization id is real, which then needs its own rate limiter. Our public
 * pages all resolve an organization server-side already, so the brand can ride
 * along: no new surface, nothing to enumerate.
 */
export const getTheme = query({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        // Readable by any signed-in member of the org, not just admins: every
        // one of them renders the app in it. Writing is the admin-gated half.
        await requireUser(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) return null;

        const org = await ctx.db.get(orgId);
        if (!org) return null;

        return {
            brandHex: org.theme?.brandHex ?? DEFAULT_BRAND_HEX,
            presetId: org.theme?.presetId ?? null,
            /** False when nothing was ever set, so the UI says "default" rather than implying a choice. */
            configured: org.theme !== undefined,
            updatedAt: org.theme?.updatedAt ?? null,
        };
    },
});

export const setTheme = mutation({
    args: {
        organization_id: v.optional(v.id("organizations")),
        /** A hex, or a preset id which supplies one. Exactly one of them. */
        brandHex: v.optional(v.string()),
        presetId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) throw appError("FORBIDDEN", "Organization context required");
        await requireOrgAccess(ctx, orgId);
        await requireFlag(ctx, "release.org_branding", orgId);

        const preset = args.presetId ? brandPreset(args.presetId) : undefined;
        if (args.presetId && !preset) {
            throw invalidArgument("That colour preset does not exist");
        }

        const raw = (preset?.hex ?? args.brandHex ?? "").trim();
        if (!isBrandHex(raw)) {
            // Named rather than generic: an admin pasting `rgb(193, 0, 58)`
            // from a brand guide needs to know which form to paste instead.
            throw invalidArgument(
                "A brand colour is a hex value such as #0369a1. Colour names and rgb() are not accepted.",
            );
        }
        const brandHex = raw.toLowerCase();

        /**
         * Derived here purely to be sure it CAN be, and to count what moved.
         *
         * The result is thrown away — the app derives its own on read. What
         * this buys is that an impossible colour fails at the moment somebody
         * saves it, with a message, rather than at render time on a volunteer's
         * phone with no way back to the person who chose it.
         */
        const derived = deriveBrand(brandHex);

        await ctx.db.patch(orgId, {
            theme: {
                brandHex,
                ...(preset ? { presetId: preset.id } : {}),
                updatedAt: new Date().toISOString(),
            },
        });

        return { brandHex, adjusted: derived.adjustments.length };
    },
});

/** Drop the brand colour; the product's own palette comes back. */
export const clearTheme = mutation({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) throw appError("FORBIDDEN", "Organization context required");
        await requireOrgAccess(ctx, orgId);

        await ctx.db.patch(orgId, { theme: undefined });
        return { brandHex: DEFAULT_BRAND_HEX };
    },
});
