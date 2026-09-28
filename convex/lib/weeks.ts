import { addDays, format } from "date-fns";

// ---------------------------------------------------------------------------
// Calendar weeks for attendance figures.
//
// One definition shared by the dashboard, the Attendance page and Reports: a
// week runs Sunday to Saturday, and "this week" is the one containing today,
// today included (so on a Sunday, this morning's service is in it). Days are
// plain "yyyy-MM-dd" strings, the same shape attendance.date is stored in, and
// are always read as local calendar days, never through UTC.
// ---------------------------------------------------------------------------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A Date as its local calendar day, "yyyy-MM-dd". */
export function localDay(date: Date): string {
    return format(date, "yyyy-MM-dd");
}

/** "yyyy-MM-dd" as local midnight. */
export function parseDay(day: string): Date {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d);
}

/**
 * The caller's today: the client's own local day when it sent a valid one
 * (the server's clock is UTC, which is a different day for part of every
 * evening outside UTC), otherwise the server's.
 */
export function resolveToday(today: string | undefined, now: Date = new Date()): string {
    return today && DAY_RE.test(today) ? today : localDay(now);
}

/** The day `n` days after `day` (negative for before). */
export function shiftDay(day: string, n: number): string {
    return localDay(addDays(parseDay(day), n));
}

/** The Sunday that starts the week containing `day`. A Sunday is its own start. */
export function weekStart(day: string): string {
    const date = parseDay(day);
    return localDay(addDays(date, -date.getDay()));
}

/** This week and last week, as inclusive day ranges. */
export function weekBounds(today: string): {
    start: string;
    end: string;
    prevStart: string;
    prevEnd: string;
} {
    const start = weekStart(today);
    return {
        start,
        end: shiftDay(start, 6),
        prevStart: shiftDay(start, -7),
        prevEnd: shiftDay(start, -1),
    };
}

/**
 * The Sundays that start the last `count` weeks, oldest first, ending with
 * the current week. Every week is present, so a chart built on these never
 * silently drops a week with nothing recorded.
 */
export function recentWeekStarts(today: string, count: number): string[] {
    const current = weekStart(today);
    const out: string[] = [];
    for (let i = count - 1; i >= 0; i--) out.push(shiftDay(current, -7 * i));
    return out;
}

/** "27 Sep", for chart axes. */
export function dayLabel(day: string): string {
    const date = parseDay(day);
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "Sep", for monthly chart axes; `month` is "yyyy-MM". */
export function monthLabel(month: string): string {
    return MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
}

/** The last `count` months as "yyyy-MM", oldest first, ending with today's month. */
export function recentMonths(today: string, count: number): string[] {
    const date = parseDay(today);
    const out: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
        out.push(format(new Date(date.getFullYear(), date.getMonth() - i, 1), "yyyy-MM"));
    }
    return out;
}

/** Percentage change, or null when there is nothing to compare against. */
export function percentChange(current: number, previous: number | null | undefined): number | null {
    if (previous === null || previous === undefined || previous <= 0) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * Week-on-week change for a run of consecutive weeks. A week with no service
 * recorded, or following one, gets no bar: a gap in the record is not a 100%
 * drop or rise, and a week after a zero has no percentage to show.
 */
export function weekOnWeekChanges<T extends { name: string; count: number; recorded: boolean }>(
    weeks: T[],
): { name: string; growth: number }[] {
    const out: { name: string; growth: number }[] = [];
    for (let i = 1; i < weeks.length; i++) {
        const prev = weeks[i - 1];
        const cur = weeks[i];
        if (!prev.recorded || !cur.recorded) continue;
        const growth = percentChange(cur.count, prev.count);
        if (growth === null) continue;
        out.push({ name: cur.name, growth });
    }
    return out;
}
