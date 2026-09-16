import { Doc, Id } from "../../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../../_generated/server";
import { isFlagEnabled } from "../flags/server";

/**
 * The brand colour to send to a page nobody has signed in to.
 *
 * Public pages — giving, check-in, a shared list — are the ones outsiders
 * actually see, so they are where branding earns its keep. They get the colour
 * inside the query they are ALREADY making against their token or organization
 * id, rather than from a public `/theme?organization=…` endpoint. That endpoint
 * would work, and it would confirm whether an organization id is real, which
 * then needs its own rate limiter. This costs no new surface.
 *
 * Returns null — not our default — when the org has set nothing or the flag is
 * off, so the caller can tell "use our own palette" from "paint this".
 */
export async function publicBrandHex(
    ctx: QueryCtx | MutationCtx,
    organizationId: Id<"organizations"> | null | undefined,
    org?: Doc<"organizations"> | null,
): Promise<string | null> {
    if (!organizationId) return null;
    if (!(await isFlagEnabled(ctx, "release.org_branding", organizationId))) return null;

    const resolved = org ?? (await ctx.db.get(organizationId));
    return resolved?.theme?.brandHex ?? null;
}
