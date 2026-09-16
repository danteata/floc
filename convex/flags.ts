import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import {
    isOrgAdmin,
    isSuperAdmin,
    normalizeOrgId,
    requireOrgAdmin,
    requireSuperAdmin,
    requireUser,
    resolveOrgId,
} from "./auth";
import { appError, invalidArgument } from "./lib/errors";
import {
    FLAGS,
    FLAG_KEYS,
    type FlagKey,
    isFlagKey,
    isKillSwitch,
    isOrgOverridable,
} from "./lib/flags/catalog";
import { resolveAll, splitOverrides, toValueMap } from "./lib/flags/resolve";

/**
 * Flag reads and writes.
 *
 * `resolved` is a plain reactive query, which is the whole argument for keeping
 * flags in our own table rather than behind a vendor: flipping one propagates to
 * every connected client instantly, with no SSE stream, no client cache to
 * invalidate and no second network hop on a request path.
 */

/**
 * Which organization's overrides apply to this caller, or null.
 *
 * Never throws — a flag read must not be able to fail a page. A signed-out
 * caller (the public giving, check-in and share pages) resolves global values
 * only, which is all a kill switch ever has, and asking for an organization the
 * caller has no access to falls back the same way rather than confirming
 * whether that organization exists.
 */
async function orgContext(
    ctx: QueryCtx,
    organizationId?: Id<"organizations">,
): Promise<Id<"organizations"> | null> {
    try {
        return await resolveOrgId(ctx, organizationId);
    } catch {
        return null;
    }
}

/**
 * Every flag's value for this caller.
 *
 * Deliberately callable without authentication. Flag state is not a secret —
 * the features it gates are protected by their own checks — and the public
 * pages need kill-switch state before there is any principal at all.
 */
export const resolved = query({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        const orgId = await orgContext(ctx, args.organization_id);
        const rows = await ctx.db.query("feature_flags").collect();
        return toValueMap(resolveAll(splitOverrides(rows, orgId)));
    },
});

/**
 * Admin view: value, source, owner, expiry, and what this caller may change.
 *
 * Everything shown comes from the CATALOGUE rather than from the rows, which is
 * what makes a flag that has never been overridden still appear, with its
 * declared default and its owner. A screen that listed only overrides would
 * hide every flag until somebody had already changed it.
 */
export const catalogue = query({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        if (!isOrgAdmin(user)) throw appError("FORBIDDEN", "Admins only");

        const orgId = await orgContext(ctx, args.organization_id);
        const rows = await ctx.db.query("feature_flags").collect();
        const input = splitOverrides(rows, orgId);
        const resolvedAll = resolveAll(input);

        const globalRow = new Map(
            rows.filter((r) => !r.organization_id).map((r) => [r.key, r]),
        );
        const orgRow = new Map(
            rows
                .filter((r) => orgId && r.organization_id === orgId)
                .map((r) => [r.key, r]),
        );

        const superAdmin = isSuperAdmin(user);

        return FLAG_KEYS.map((key) => {
            const def = FLAGS[key];
            const orgOverride = orgRow.get(key);
            const global = globalRow.get(key);
            return {
                key,
                value: resolvedAll[key].value,
                source: resolvedAll[key].source,
                description: def.description,
                owner: def.owner,
                kind: def.kind,
                expiresAt: def.expiresAt,
                killSwitch: def.killSwitch,
                defaultValue: def.defaultValue,
                /** What the deployment-wide row says, for the super-admin view. */
                globalValue: global ? global.enabled : null,
                orgValue: orgOverride ? orgOverride.enabled : null,
                updatedAt: (orgOverride ?? global)?.updated_at ?? null,
                /** Whether THIS caller can act, so the UI doesn't offer a refusal. */
                canSetGlobal: superAdmin,
                canSetForOrg: def.orgOverridable && !!orgId,
            };
        });
    },
});

/**
 * Set an override.
 *
 * Two scopes with two different gates:
 *
 *  - `global` is deployment-wide and super-admin only. Every kill switch lives
 *    here, and letting an org admin write one would be a cross-tenant control
 *    dressed up as a settings screen.
 *  - `org` is this organization's own row, and only for flags the catalogue
 *    declares `orgOverridable` — never a kill switch.
 *
 * Both audited with before/after, because "who turned SMS off during the
 * incident, and when" gets asked afterwards and needs a real answer.
 */
export const set = mutation({
    args: {
        key: v.string(),
        enabled: v.boolean(),
        scope: v.union(v.literal("global"), v.literal("org")),
        organization_id: v.optional(v.id("organizations")),
    },
    handler: async (ctx, args) => {
        // Only declared flags. An arbitrary key would create a value nothing
        // reads and nobody can find later.
        if (!isFlagKey(args.key)) throw invalidArgument(`Unknown flag: ${args.key}`);
        const key: FlagKey = args.key;

        const { user, orgId } = await authorizeWrite(ctx, key, args.scope, args.organization_id);
        const now = new Date().toISOString();

        const existing = await findOverride(ctx, key, args.scope === "org" ? orgId : null);
        const before = existing?.enabled ?? FLAGS[key].defaultValue;

        if (existing) {
            await ctx.db.patch(existing._id, {
                enabled: args.enabled,
                updated_at: now,
                updated_by: user.clerk_user_id,
            });
        } else {
            await ctx.db.insert("feature_flags", {
                key,
                ...(args.scope === "org" && orgId ? { organization_id: orgId } : {}),
                enabled: args.enabled,
                updated_at: now,
                updated_by: user.clerk_user_id,
            });
        }

        await ctx.runMutation(internal.audit.logEvent, {
            action: "flag.set",
            entity_type: "feature_flag",
            entity_id: key,
            entity_name: key,
            performed_by: user._id,
            performed_by_name: user.name || "Unknown",
            performed_by_role: user.role,
            ...(orgId ? { organization_id: orgId } : {}),
            changes: { before, after: args.enabled },
            metadata: { scope: args.scope, kill_switch: isKillSwitch(key) },
        });

        return { key, enabled: args.enabled, scope: args.scope };
    },
});

/** Drop an override so the flag falls back to the next level down. */
export const clearOverride = mutation({
    args: {
        key: v.string(),
        scope: v.union(v.literal("global"), v.literal("org")),
        organization_id: v.optional(v.id("organizations")),
    },
    handler: async (ctx, args) => {
        if (!isFlagKey(args.key)) throw invalidArgument(`Unknown flag: ${args.key}`);
        const key: FlagKey = args.key;

        const { user, orgId } = await authorizeWrite(ctx, key, args.scope, args.organization_id);
        const existing = await findOverride(ctx, key, args.scope === "org" ? orgId : null);
        if (!existing) return { key, cleared: false };

        await ctx.db.delete(existing._id);

        await ctx.runMutation(internal.audit.logEvent, {
            action: "flag.cleared",
            entity_type: "feature_flag",
            entity_id: key,
            entity_name: key,
            performed_by: user._id,
            performed_by_name: user.name || "Unknown",
            performed_by_role: user.role,
            ...(orgId ? { organization_id: orgId } : {}),
            changes: { before: existing.enabled, after: FLAGS[key].defaultValue },
            metadata: { scope: args.scope },
        });

        return { key, cleared: true };
    },
});

async function authorizeWrite(
    ctx: MutationCtx,
    key: FlagKey,
    scope: "global" | "org",
    organizationId?: Id<"organizations">,
) {
    if (scope === "global") {
        const user = await requireSuperAdmin(ctx);
        return { user, orgId: normalizeOrgId(ctx, organizationId) };
    }

    // Per-organization. The catalogue decides what may be overridden at all;
    // the kill-switch check is stated separately because it is the rule that
    // matters most and shouldn't rely on the two flags agreeing.
    if (isKillSwitch(key)) {
        throw appError(
            "FORBIDDEN",
            "A kill switch is a deployment-wide control and can't be set per organization.",
        );
    }
    if (!isOrgOverridable(key)) {
        throw appError("FORBIDDEN", `${key} can only be set for the whole deployment.`);
    }

    const user = await requireOrgAdmin(ctx);
    const orgId = await resolveOrgId(ctx, organizationId);
    if (!orgId) throw appError("FORBIDDEN", "Organization context required");
    return { user, orgId };
}

async function findOverride(
    ctx: QueryCtx,
    key: FlagKey,
    orgId: Id<"organizations"> | null,
) {
    const rows = await ctx.db
        .query("feature_flags")
        .withIndex("by_key", (q) => q.eq("key", key))
        .collect();
    return rows.find((row) =>
        orgId ? row.organization_id === orgId : !row.organization_id,
    );
}
