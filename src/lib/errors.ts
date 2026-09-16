import { ConvexError } from "convex/values"

/**
 * Reading a backend error in the UI.
 *
 * A `ConvexError`'s useful text lives in `err.data.message`; its own `.message`
 * is a stringified wrapper ("[CONVEX] ..."), which is what several of our
 * toasts were showing. These two helpers are the only thing a component needs:
 * `errorMessage` for what to say, `errorCode` for what to do about it.
 *
 * Codes are declared in `convex/lib/errors.ts`.
 */
type ErrorPayload = { code?: string; message?: string }

function payloadOf(err: unknown): ErrorPayload | null {
  if (err instanceof ConvexError) {
    const data = err.data as unknown
    if (typeof data === "object" && data !== null) return data as ErrorPayload
    if (typeof data === "string") return { message: data }
  }
  return null
}

/** The backend's code, when it sent one. */
export function errorCode(err: unknown): string | null {
  return payloadOf(err)?.code ?? null
}

/** What to show the user. Falls back through the error's own message. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const payload = payloadOf(err)
  if (payload?.message) return payload.message
  if (err instanceof Error && err.message) return err.message
  return fallback
}

/** The org's plan is the blocker — the caller should offer an upgrade, not an apology. */
export function isPlanError(err: unknown): boolean {
  const code = errorCode(err)
  return code === "PLAN_REQUIRED" || code === "PLAN_LIMIT"
}
