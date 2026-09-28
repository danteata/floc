// =============================================================================
// Time zone helpers (pure, no DB).
//
// A church may set an IANA `timezone` on its organization. When it hasn't,
// every helper here treats the church as keeping UTC, which is true for Ghana
// (the default market) and is how the app always computed days and times.
// =============================================================================

/** True when `timeZone` is an IANA zone this runtime understands. */
export function isValidTimeZone(timeZone: string): boolean {
    if (!timeZone) return false;
    try {
        new Intl.DateTimeFormat("en", { timeZone });
        return true;
    } catch {
        return false;
    }
}

/**
 * The UTC instant of a wall-clock time (`date` "YYYY-MM-DD", `time` "HH:mm") in
 * an IANA time zone. Returns NaN when the inputs don't parse. An unknown zone
 * falls back to UTC.
 */
export function zonedTimeToUtcMs(date: string, time: string, timeZone: string): number {
    const naiveMs = Date.parse(`${date}T${time}:00Z`);
    if (Number.isNaN(naiveMs) || timeZone === "UTC") return naiveMs;
    let dtf: Intl.DateTimeFormat;
    try {
        dtf = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    } catch {
        return naiveMs;
    }
    // Offset of the zone at a given instant, in ms (zone wall clock - UTC).
    const offsetAt = (ms: number) => {
        const parts: Record<string, number> = {};
        for (const p of dtf.formatToParts(new Date(ms))) {
            if (p.type !== "literal") parts[p.type] = Number(p.value);
        }
        const asUtc = Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour,
            parts.minute,
            parts.second,
        );
        return asUtc - ms;
    };
    // Two passes settle the offset across a DST change.
    let utcMs = naiveMs - offsetAt(naiveMs);
    utcMs = naiveMs - offsetAt(utcMs);
    return utcMs;
}

/** The calendar day ("YYYY-MM-DD") of an instant in an IANA time zone (UTC by default). */
export function localDayIn(now: Date, timeZone?: string): string {
    if (timeZone) {
        try {
            // en-CA formats as YYYY-MM-DD.
            return new Intl.DateTimeFormat("en-CA", {
                timeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }).format(now);
        } catch {
            // Unknown zone: fall through to UTC.
        }
    }
    return now.toISOString().slice(0, 10);
}

/**
 * The first and last instant of a church's local calendar day `date`
 * ("YYYY-MM-DD"), as ISO strings, for range comparisons against stored ISO
 * timestamps. Without a zone (or with an unknown one) these are exactly
 * `${date}T00:00:00.000Z` and `${date}T23:59:59.999Z`.
 */
export function localDayBoundsIso(
    date: string,
    timeZone?: string,
): { start: string; end: string } {
    const utcStart = `${date}T00:00:00.000Z`;
    const utcEnd = `${date}T23:59:59.999Z`;
    if (!timeZone) return { start: utcStart, end: utcEnd };
    const startMs = zonedTimeToUtcMs(date, "00:00", timeZone);
    const naiveNext = Date.parse(`${date}T00:00:00Z`) + 24 * 3600 * 1000;
    if (Number.isNaN(startMs) || Number.isNaN(naiveNext)) {
        return { start: utcStart, end: utcEnd };
    }
    const nextDate = new Date(naiveNext).toISOString().slice(0, 10);
    const nextStartMs = zonedTimeToUtcMs(nextDate, "00:00", timeZone);
    return {
        start: new Date(startMs).toISOString(),
        end: new Date(nextStartMs - 1).toISOString(),
    };
}
