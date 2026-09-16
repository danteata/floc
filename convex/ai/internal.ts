import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { open } from "../lib/secretBox";
import { appError, notFound } from "../lib/errors";
import { requireOrgAdmin, resolveOrgId } from "../auth";
import { requireFeature } from "../entitlements";

/**
 * Storing and reading an organization's provider key.
 *
 * Split from the actions because sealing needs randomness — action territory —
 * while the writes must be transactional. The action does the cryptography and
 * hands this a finished ciphertext. Convex retries mutations, so nothing inside
 * one may be non-deterministic.
 */

export const store = internalMutation({
    args: {
        organization_id: v.id("organizations"),
        clerk_user_id: v.string(),
        provider: v.union(v.literal("anthropic"), v.literal("openai")),
        ciphertext: v.string(),
        iv: v.string(),
        hint: v.string(),
        base_url: v.optional(v.string()),
        model: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("ai_credentials")
            .withIndex("by_org_provider", (q) =>
                q.eq("organization_id", args.organization_id).eq("provider", args.provider),
            )
            .unique();

        const now = new Date().toISOString();
        const fields = {
            ciphertext: args.ciphertext,
            iv: args.iv,
            hint: args.hint,
            base_url: args.base_url,
            model: args.model,
            status: "active" as const,
            /**
             * Cleared on every save.
             *
             * The commonest reason anybody re-enters a key is that the last one
             * stopped working, and leaving the old error beside the new key
             * would tell them it is still broken before it has been tried once.
             */
            last_error: undefined,
            last_used_at: undefined,
            updated_at: now,
        };

        if (existing) {
            await ctx.db.patch(existing._id, fields);
            return existing._id;
        }
        // One credential per provider per organization. Two would need a rule
        // for which wins, and there is no question that rule would answer well.
        return await ctx.db.insert("ai_credentials", {
            organization_id: args.organization_id,
            provider: args.provider,
            created_by: args.clerk_user_id,
            created_at: now,
            ...fields,
        });
    },
});

export const remove = internalMutation({
    args: {
        organization_id: v.id("organizations"),
        credential_id: v.id("ai_credentials"),
    },
    handler: async (ctx, args) => {
        const row = await ctx.db.get(args.credential_id);
        /**
         * Re-checked here rather than trusted from the action, and it THROWS.
         *
         * An internal mutation is the last place tenancy can be enforced, and
         * the id arrived from a client. Returning null for another org's row
         * would report success for a deletion that did not happen. NOT_FOUND
         * rather than FORBIDDEN, so the refusal doesn't confirm that somebody
         * else's credential exists.
         */
        if (!row || row.organization_id !== args.organization_id) throw notFound("Credential");
        await ctx.db.delete(args.credential_id);
        return null;
    },
});

/**
 * Record what happened when a key was used.
 *
 * Called after every provider call, successful or not, so the settings page can
 * answer "is this key still working?" without anybody having to run a job.
 */
export const noteUse = internalMutation({
    args: {
        credential_id: v.id("ai_credentials"),
        ok: v.boolean(),
        error: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const row = await ctx.db.get(args.credential_id);
        if (!row) return null;
        const now = new Date().toISOString();
        await ctx.db.patch(args.credential_id, {
            ...(args.ok
                ? { last_used_at: now, last_error: undefined }
                : { last_error: (args.error ?? "unknown error").slice(0, 300) }),
            updated_at: now,
        });
        return null;
    },
});

/**
 * The decrypted key for one organization, or null.
 *
 * **Internal, and it returns a live credential** — which is why it is not, and
 * must never become, a public query. Every caller is a server-side action about
 * to make a provider call.
 *
 * Returns null rather than throwing when nothing is stored: an organization
 * with no key of its own is the ordinary case, and the caller falls through to
 * the deployment's.
 */
export const credentialFor = internalQuery({
    args: { organization_id: v.id("organizations") },
    handler: async (ctx, args) => {
        const rows = await ctx.db
            .query("ai_credentials")
            .withIndex("by_org_provider", (q) => q.eq("organization_id", args.organization_id))
            .collect();
        const active = rows.find((row) => row.status === "active");
        if (!active) return null;

        return {
            credential_id: active._id as Id<"ai_credentials">,
            provider: active.provider,
            api_key: await open({ ciphertext: active.ciphertext, iv: active.iv }),
            base_url: active.base_url ?? null,
            model: active.model ?? null,
        };
    },
});

/**
 * Who may change an organization's provider key, and WHICH organization they
 * are changing.
 *
 * A mutation rather than a helper, because it is called FROM an action and an
 * action has no database handle of its own. Putting the check here means
 * `ai/credentials` never has to be trusted with the answer: the
 * `organization_id` it passes is a hint about which membership to resolve, not
 * an instruction about where to write.
 *
 * Org admin — the role that owns the rest of the settings screen — plus the Pro
 * entitlement, because a key with no feature to use it is a liability we'd be
 * storing for nothing.
 */
export const forCredentialChange = internalMutation({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        const user = await requireOrgAdmin(ctx);
        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) throw appError("FORBIDDEN", "Organization context required");
        await requireFeature(ctx, "ai_copilot", orgId);

        /**
         * Audited before the write, and deliberately without the key.
         *
         * "Somebody changed the AI provider key" is exactly the event a
         * security review looks for, and it is one of the few writes whose
         * CONTENT must never appear in the log that records it.
         */
        await ctx.runMutation(internal.audit.logEvent, {
            action: "ai.credential.changed",
            entity_type: "organization",
            entity_id: orgId,
            performed_by: user._id,
            performed_by_name: user.name || "Unknown",
            performed_by_role: user.role,
            organization_id: orgId,
        });

        return { organization_id: orgId, clerk_user_id: user.clerk_user_id };
    },
});
