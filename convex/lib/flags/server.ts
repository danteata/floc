import { Id } from "../../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../../_generated/server";
import { featureDisabled } from "../errors";
import { type FlagKey, flagDefinition } from "./catalog";
import { resolveFlag, splitOverrides } from "./resolve";

type Ctx = QueryCtx | MutationCtx;

/**
 * Server-side flag evaluation.
 *
 * Kill switches are enforced HERE, not by hiding a button. A client-side check
 * is a courtesy to the user; this is the control. If `kill.sms_dispatch` is
 * off, a queued task replayed by the dispatcher must be refused just as surely
 * as someone clicking a disabled button.
 *
 * Reads the whole (small) table rather than a keyed index: the org override and
 * the global override for a key live in different rows, and a flag check must
 * never be the reason a request got slower. If this table ever grows past a
 * few dozen rows, that means we have flag debt, not a performance problem.
 */
export async function isFlagEnabled(
    ctx: Ctx,
    key: FlagKey,
    organizationId?: Id<"organizations"> | null,
): Promise<boolean> {
    const rows = await ctx.db.query("feature_flags").collect();
    return resolveFlag(key, splitOverrides(rows, organizationId ?? null)).value;
}

/**
 * Refuse when a feature is switched off.
 *
 * The counterpart to hiding a tab: hiding makes a feature invisible, this makes
 * it *absent*, so an old bundle, a stale tab or a direct API call is refused
 * too. `FEATURE_DISABLED` rather than `FORBIDDEN` on purpose — a user told they
 * lack permission goes and asks for a role that would not help.
 */
export async function requireFlag(
    ctx: Ctx,
    key: FlagKey,
    organizationId?: Id<"organizations"> | null,
    message?: string,
): Promise<void> {
    if (await isFlagEnabled(ctx, key, organizationId)) return;
    throw featureDisabled(
        message ?? defaultRefusal(key),
        { flag: key },
    );
}

/**
 * What to say when there is nothing better to say.
 *
 * Deliberately not the catalogue's `description` — that is written for whoever
 * operates the switch ("Disable to shed load"), and telling a user their church
 * admin can shed load is not an explanation. This says the true, useful thing:
 * it is off, nobody here can use it, and it is temporary.
 */
function defaultRefusal(key: FlagKey): string {
    return flagDefinition(key).killSwitch
        ? "This is temporarily switched off while we deal with a problem. Please try again later."
        : "This feature isn't switched on for your organization yet.";
}
