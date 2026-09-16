import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { fingerprint, seal } from "../lib/secretBox";
import { PROVIDER_LABELS, probeProvider } from "../lib/aiProviders";

/**
 * Bring-your-own-key, for organizations that would rather their members' data
 * went to their own vendor account.
 *
 * The reason is data protection before it is cost. With a key of their own, a
 * church's pastoral notes reach the model under the church's contract,
 * retention settings and region — a far better answer to a safeguarding review
 * than "trust our agreement with a third party".
 *
 * Actions rather than mutations because sealing draws a random IV, which a
 * retried mutation may not do. The ciphertext is handed to `ai/internal:store`,
 * which is where the write happens.
 *
 * NOTE: no `"use node"`. `crypto.subtle` is available in Convex's default
 * runtime, and it has to be — `ai/internal:credentialFor` decrypts inside a
 * QUERY, which can never run in Node.
 */

/**
 * The plaintext key never comes back out.
 *
 * `set` returns only what the settings page needs to render a row: which
 * provider, and the last four characters.
 */
export const set = action({
    args: {
        organization_id: v.optional(v.id("organizations")),
        provider: v.union(v.literal("anthropic"), v.literal("openai")),
        api_key: v.string(),
        base_url: v.optional(v.string()),
        model: v.optional(v.string()),
    },
    handler: async (ctx, args): Promise<{ hint: string; provider: string }> => {
        const apiKey = args.api_key.trim();
        if (apiKey.length < 8) {
            throw new Error("That doesn't look like an API key. Paste the whole thing.");
        }

        /**
         * Authorisation happens in a mutation, not here.
         *
         * An action has no database handle, so the admin check and the Pro
         * entitlement are enforced by `ai/internal:forCredentialChange` — which
         * also resolves WHICH organization the caller is acting for. Doing it
         * there rather than trusting `args.organization_id` is what stops this
         * becoming a route to writing a credential into somebody else's tenant.
         */
        const who = await ctx.runMutation(internal.ai.internal.forCredentialChange, {
            ...(args.organization_id ? { organization_id: args.organization_id } : {}),
        });

        const sealed = await seal(apiKey);
        await ctx.runMutation(internal.ai.internal.store, {
            organization_id: who.organization_id,
            clerk_user_id: who.clerk_user_id,
            provider: args.provider,
            ciphertext: sealed.ciphertext,
            iv: sealed.iv,
            hint: fingerprint(apiKey),
            ...(args.base_url?.trim() ? { base_url: args.base_url.trim() } : {}),
            ...(args.model?.trim() ? { model: args.model.trim() } : {}),
        });

        return { hint: fingerprint(apiKey), provider: args.provider };
    },
});

export const clear = action({
    args: {
        organization_id: v.optional(v.id("organizations")),
        credential_id: v.id("ai_credentials"),
    },
    handler: async (ctx, args): Promise<null> => {
        const who = await ctx.runMutation(internal.ai.internal.forCredentialChange, {
            ...(args.organization_id ? { organization_id: args.organization_id } : {}),
        });
        await ctx.runMutation(internal.ai.internal.remove, {
            organization_id: who.organization_id,
            credential_id: args.credential_id,
        });
        return null;
    },
});

/**
 * Try the stored key against the provider, and record what happened.
 *
 * Deliberately a button rather than something `set` does automatically. Saving
 * a key and reaching a vendor are different failures — a network blip while
 * somebody pastes a perfectly good key shouldn't look like a rejected key — and
 * an admin who wants to know chooses to find out. It is also what makes
 * `last_used_at` / `last_error` real rather than decorative: without it, the
 * first thing to exercise a key is a drafting job at 6am on a Sunday.
 */
export const test = action({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (
        ctx,
        args,
    ): Promise<{ ok: boolean; provider: string | null; message: string }> => {
        const who = await ctx.runMutation(internal.ai.internal.forCredentialChange, {
            ...(args.organization_id ? { organization_id: args.organization_id } : {}),
        });

        const credential: {
            credential_id: Id<"ai_credentials">;
            provider: "anthropic" | "openai";
            api_key: string;
            base_url: string | null;
            model: string | null;
        } | null = await ctx.runQuery(internal.ai.internal.credentialFor, {
            organization_id: who.organization_id,
        });

        if (!credential) {
            return { ok: false, provider: null, message: "No provider key is stored yet." };
        }

        const result = await probeProvider(credential);
        await ctx.runMutation(internal.ai.internal.noteUse, {
            credential_id: credential.credential_id,
            ok: result.ok,
            ...(result.ok ? {} : { error: result.message }),
        });

        return {
            ok: result.ok,
            provider: PROVIDER_LABELS[credential.provider],
            message: result.message,
        };
    },
});
