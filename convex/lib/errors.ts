import { ConvexError } from "convex/values";

/**
 * Domain errors, with a code the client can branch on.
 *
 * `convex/entitlements.ts` already threw `ConvexError({ code, message, ... })`
 * by hand; this is that convention written down once, so a second module
 * doesn't invent a third shape. The payload is unchanged, so anything already
 * reading `err.data.code` keeps working.
 *
 * Why a code at all: the client should not string-match messages to decide what
 * to show. `PLAN_REQUIRED` opens the upgrade dialog, `FORBIDDEN` doesn't, and
 * the message can be reworded without breaking either.
 */
export type ErrorCode =
    /** The caller may not do this. They could ask for a role that would help. */
    | "FORBIDDEN"
    /** Nobody here may do this *yet* — a feature flag is off. Different from
     *  FORBIDDEN on purpose: a user told "you lack permission" goes and asks
     *  for a role that would change nothing. */
    | "FEATURE_DISABLED"
    /** The org's plan doesn't include this. Raised by entitlements.ts. */
    | "PLAN_REQUIRED"
    /** A plan's numeric ceiling was hit (member count, etc.). */
    | "PLAN_LIMIT"
    | "NOT_FOUND"
    | "INVALID_ARGUMENT"
    /** The write conflicts with current state (already archived, wrong status). */
    | "CONFLICT";

export type AppErrorData = {
    code: ErrorCode;
    message: string;
    /** Flat, so the payload stays a Convex `Value` and survives the wire. */
    detail?: Record<string, string | number | boolean>;
};

export function appError(
    code: ErrorCode,
    message: string,
    detail?: Record<string, string | number | boolean>,
): ConvexError<AppErrorData> {
    return new ConvexError({ code, message, ...(detail ? { detail } : {}) });
}

export function forbidden(message = "You do not have permission to do this") {
    return appError("FORBIDDEN", message);
}

export function notFound(what = "Resource") {
    return appError("NOT_FOUND", `${what} not found`);
}

export function invalidArgument(message: string, detail?: AppErrorData["detail"]) {
    return appError("INVALID_ARGUMENT", message, detail);
}

/**
 * A feature is switched off for this deployment or organization.
 *
 * The counterpart to hiding a button: hiding makes a feature invisible, this is
 * what makes it *absent*, so an old bundle or a direct API call is refused too.
 */
export function featureDisabled(message: string, detail?: AppErrorData["detail"]) {
    return appError("FEATURE_DISABLED", message, detail);
}
