// =============================================================================
// Guardrail helpers — kill switch, quiet hours + rate caps.
//
// The time math is factored into pure functions so it can be unit-verified
// independently of the DB. The dispatcher wires these to member/org config and
// the message_log.
// =============================================================================

import { MutationCtx, QueryCtx } from "../_generated/server";
import { isFlagEnabled } from "../lib/flags/server";

/**
 * Global kill switch, now `kill.automations` in the flag catalogue — declared,
 * typed, audited on every flip and visible in the flags console, which the
 * `app_config` row it replaces was none of.
 *
 * The old row is still honoured for one release so an existing deployment that
 * has automation switched OFF stays off across the deploy. Either switch being
 * off means off; the flag is the one to use from here on, and this fallback
 * comes out once no deployment has the row.
 */
export async function isAutomationEnabled(
    ctx: MutationCtx | QueryCtx,
): Promise<boolean> {
    if (!(await isFlagEnabled(ctx, "kill.automations"))) return false;

    const legacy = await ctx.db
        .query("app_config")
        .withIndex("by_key", (q) => q.eq("key", "automation.enabled"))
        .unique();
    if (!legacy) return true;
    return (legacy.value as { enabled?: boolean } | undefined)?.enabled !== false;
}

// SMS rate caps (from the enhancement plan's throttling table).
export const SMS_HOURLY_CAP = 3;
export const SMS_DAILY_CAP = 10;

export const HOUR_MS = 3600 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** "HH:MM" -> minutes since midnight, or null if malformed. */
export function parseHHMM(s?: string | null): number | null {
    if (!s) return null;
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

/**
 * Is `currentMin` inside the quiet window [startMin, endMin)? Handles windows
 * that wrap past midnight (e.g. 22:00–07:00). Returns false if either bound is
 * null (no quiet hours configured).
 */
export function isWithinWindow(
    currentMin: number,
    startMin: number | null,
    endMin: number | null,
): boolean {
    if (startMin === null || endMin === null) return false;
    if (startMin === endMin) return false; // zero-length window
    if (startMin < endMin) {
        // Same-day window, e.g. 01:00–05:00
        return currentMin >= startMin && currentMin < endMin;
    }
    // Wrapping window, e.g. 22:00–07:00
    return currentMin >= startMin || currentMin < endMin;
}

/** Minutes since local midnight in the given IANA timezone (UTC fallback). */
export function localMinutesNow(timezone: string | undefined, nowMs: number): number {
    try {
        const fmt = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone || "UTC",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
        const parts = fmt.formatToParts(new Date(nowMs));
        let h = Number(parts.find((p) => p.type === "hour")?.value);
        const min = Number(parts.find((p) => p.type === "minute")?.value);
        if (h === 24) h = 0; // some environments emit "24" at midnight
        return h * 60 + min;
    } catch {
        const d = new Date(nowMs);
        return d.getUTCHours() * 60 + d.getUTCMinutes();
    }
}

/** Count timestamps (ms) at or after `since`. */
export function countSince(timestampsMs: number[], since: number): number {
    let n = 0;
    for (const t of timestampsMs) if (t >= since) n++;
    return n;
}

export type RateVerdict = { allowed: boolean; retryAfterMs?: number; reason?: string };

/**
 * Decide whether another SMS is allowed given recent send timestamps.
 * Over the hourly cap defers ~1h; over the daily cap defers ~6h.
 */
export function checkSmsRate(recentSendTimestampsMs: number[], nowMs: number): RateVerdict {
    const inDay = countSince(recentSendTimestampsMs, nowMs - DAY_MS);
    if (inDay >= SMS_DAILY_CAP) {
        return { allowed: false, retryAfterMs: 6 * HOUR_MS, reason: "sms_daily_cap" };
    }
    const inHour = countSince(recentSendTimestampsMs, nowMs - HOUR_MS);
    if (inHour >= SMS_HOURLY_CAP) {
        return { allowed: false, retryAfterMs: HOUR_MS, reason: "sms_hourly_cap" };
    }
    return { allowed: true };
}
