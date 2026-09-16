import { v } from "convex/values";
import { query } from "../_generated/server";
import { isOrgAdmin, requireUser, resolveOrgId } from "../auth";
import { appError } from "../lib/errors";
import { PROVIDER_LABELS } from "../lib/aiProviders";
import { isFlagEnabled } from "../lib/flags/server";

/**
 * What the settings page needs to render the AI section.
 *
 * Everything here is safe to send to a browser: which provider, the last four
 * characters of the key, and whether it last worked. The key itself is readable
 * in exactly one place — `ai/internal:credentialFor` — which is an internal
 * query no client can call.
 */
export const status = query({
    args: { organization_id: v.optional(v.id("organizations")) },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        if (!isOrgAdmin(user)) throw appError("FORBIDDEN", "Admins only");

        const orgId = await resolveOrgId(ctx, args.organization_id);
        if (!orgId) return null;

        const rows = await ctx.db
            .query("ai_credentials")
            .withIndex("by_org_provider", (q) => q.eq("organization_id", orgId))
            .collect();

        return {
            /**
             * Whether AI is switched on deployment-wide. Shown so an admin
             * looking at a key that "isn't doing anything" can see the reason
             * without opening a support ticket.
             */
            enabled: await isFlagEnabled(ctx, "kill.ai_copilot", orgId),
            credentials: rows.map((row) => ({
                id: row._id,
                provider: row.provider,
                provider_label: PROVIDER_LABELS[row.provider],
                hint: row.hint,
                base_url: row.base_url ?? null,
                model: row.model ?? null,
                status: row.status,
                last_used_at: row.last_used_at ?? null,
                last_error: row.last_error ?? null,
                updated_at: row.updated_at,
            })),
        };
    },
});
