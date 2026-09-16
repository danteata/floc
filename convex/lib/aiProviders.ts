/**
 * Which provider answers, and with whose key.
 *
 * Adapted from CodeOS (`convex/lib/aiProviders.ts`). One place, because every
 * AI feature reads identical configuration — CodeOS's was three copies of "read
 * the env" that drifted into three different behaviours, so a deployment
 * configured for one vendor got marking and, with no error anywhere, no
 * analysis and no tutor.
 *
 * ## Resolution order
 *
 * **The organization's own key first, then the deployment's, then nothing.**
 *
 * An organization that has supplied a key has said something specific: send our
 * members' data to our vendor account, under our contract. Falling back to the
 * platform's key when theirs fails would quietly undo that — the data would go
 * somewhere they did not agree to — so an org with a key configured either uses
 * it or gets nothing. The fallback exists for organizations that have
 * configured nothing at all.
 */

export type ProviderName = "anthropic" | "openai";

export const PROVIDER_LABELS: Record<ProviderName, string> = {
    anthropic: "Anthropic (Claude)",
    openai: "OpenAI-compatible",
};

/**
 * The model used when neither the organization nor the deployment names one.
 *
 * Sonnet rather than the largest available: pastoral drafting is short,
 * heavily-grounded text against structured facts, and it runs nightly across
 * every at-risk member — the volume is what makes the choice, not the ceiling.
 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

/** An organization's credential, already decrypted by the caller. */
export interface OrgCredential {
    provider: ProviderName;
    api_key: string;
    base_url?: string | null;
    model?: string | null;
}

export interface ResolvedProvider {
    provider: ProviderName;
    apiKey: string;
    baseUrl: string;
    model: string;
    /** True when the key belongs to the organization rather than the deployment. */
    orgOwned: boolean;
}

const DEFAULT_BASE_URL: Record<ProviderName, string> = {
    anthropic: "https://api.anthropic.com",
    openai: "https://api.openai.com",
};

const DEFAULT_MODEL: Record<ProviderName, string> = {
    anthropic: DEFAULT_ANTHROPIC_MODEL,
    openai: DEFAULT_OPENAI_MODEL,
};

/**
 * The deployment's own provider, if one is configured.
 *
 * Read from the environment rather than the database: a platform key is a
 * deployment secret, not tenant configuration, and putting it in a table would
 * make it visible to the same dashboard read that `ai_credentials` is encrypted
 * against.
 */
function deploymentProvider(): ResolvedProvider | null {
    const anthropic = process.env.ANTHROPIC_API_KEY;
    if (anthropic) {
        return {
            provider: "anthropic",
            apiKey: anthropic,
            baseUrl: process.env.AI_BASE_URL || DEFAULT_BASE_URL.anthropic,
            model: process.env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL,
            orgOwned: false,
        };
    }
    const openai = process.env.OPENAI_API_KEY;
    if (openai) {
        return {
            provider: "openai",
            apiKey: openai,
            baseUrl: process.env.AI_BASE_URL || DEFAULT_BASE_URL.openai,
            model: process.env.AI_MODEL || DEFAULT_OPENAI_MODEL,
            orgOwned: false,
        };
    }
    return null;
}

/**
 * Who to call for this organization, or null if nobody is configured.
 *
 * Null is an ordinary, expected answer — every feature built on this must
 * decline honestly rather than guess. See the note in CodeOS's
 * `adapters/none.ts`: an organization that has not chosen a provider has not
 * consented to a model touching their members' data, and the fallback for a
 * declined draft is a person, which is where the work already was.
 */
export function resolveProvider(credential: OrgCredential | null): ResolvedProvider | null {
    if (credential) {
        return {
            provider: credential.provider,
            apiKey: credential.api_key,
            baseUrl: credential.base_url || DEFAULT_BASE_URL[credential.provider],
            model: credential.model || DEFAULT_MODEL[credential.provider],
            orgOwned: true,
        };
    }
    return deploymentProvider();
}

/**
 * The smallest real request each provider accepts, used to answer "does this
 * key work?".
 *
 * A real call rather than a format check: the failures that matter are a
 * revoked key, a key for the wrong account, and an endpoint that doesn't exist,
 * and none of those is visible in the string. One token of output, so finding
 * out costs essentially nothing.
 */
export async function probeProvider(
    credential: OrgCredential,
): Promise<{ ok: boolean; message: string }> {
    const resolved = resolveProvider(credential);
    if (!resolved) return { ok: false, message: "No provider is configured." };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
        const response =
            resolved.provider === "anthropic"
                ? await fetch(`${resolved.baseUrl}/v1/messages`, {
                      method: "POST",
                      signal: controller.signal,
                      headers: {
                          "content-type": "application/json",
                          "x-api-key": resolved.apiKey,
                          "anthropic-version": "2023-06-01",
                      },
                      body: JSON.stringify({
                          model: resolved.model,
                          max_tokens: 1,
                          messages: [{ role: "user", content: "ping" }],
                      }),
                  })
                : await fetch(`${resolved.baseUrl}/v1/chat/completions`, {
                      method: "POST",
                      signal: controller.signal,
                      headers: {
                          "content-type": "application/json",
                          authorization: `Bearer ${resolved.apiKey}`,
                      },
                      body: JSON.stringify({
                          model: resolved.model,
                          max_tokens: 1,
                          messages: [{ role: "user", content: "ping" }],
                      }),
                  });

        if (response.ok) {
            return { ok: true, message: `Reached ${resolved.model} successfully.` };
        }

        /**
         * The provider's own words, truncated — and never the key.
         *
         * "401 Unauthorized" and "model not found" send an admin to completely
         * different places, and a generic "couldn't connect" sends them to
         * neither.
         */
        const body = (await response.text()).slice(0, 200);
        return {
            ok: false,
            message: `${resolved.provider} refused the request (HTTP ${response.status}). ${body}`,
        };
    } catch (error) {
        if (controller.signal.aborted) {
            return { ok: false, message: "The provider didn't respond within 15 seconds." };
        }
        return {
            ok: false,
            message: error instanceof Error ? error.message : "Could not reach the provider.",
        };
    } finally {
        clearTimeout(timer);
    }
}
