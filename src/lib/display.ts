const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const MINOR_WORDS = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "or", "the", "to"])

/**
 * "sunday service" -> "Sunday Service", "day of prayer" -> "Day of Prayer".
 * For showing event-type and session names, which are often stored in lower
 * case. Only lower-case letters at the start of a word are raised, so names
 * the church already capitalised ("Choir Rehearsal", "YPG") are left alone.
 * Display only: never write the result back.
 */
export function titleCase(value: string | null | undefined): string {
    if (!value) return ""
    let index = 0
    return value.replace(/\S+/g, (word) => {
        const isFirst = index++ === 0
        if (!isFirst && MINOR_WORDS.has(word)) return word
        return word.replace(/^([^\p{L}]*)(\p{Ll})/u, (_, lead: string, letter: string) => lead + letter.toUpperCase())
    })
}

/**
 * "2026-09-26" -> "26 Sep 2026". A plain calendar date is read as local time
 * so it never slips a day across time zones. Anything unparseable is returned
 * as given.
 */
export function formatDay(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined || value === "") return ""
    let date: Date
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split("-").map(Number)
        date = new Date(y, m - 1, d)
    } else {
        date = value instanceof Date ? value : new Date(value)
    }
    if (Number.isNaN(date.getTime())) return String(value)
    // Spelled out here rather than through Intl, which writes "Sept" in some
    // browsers and "Sep" in others.
    return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

function toDate(value: string | number | Date): Date {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split("-").map(Number)
        return new Date(y, m - 1, d)
    }
    return value instanceof Date ? value : new Date(value)
}

/** "26 Sep", or "26 Sep 2025" when it isn't this year. */
export function formatDayShort(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined || value === "") return ""
    const date = toDate(value)
    if (Number.isNaN(date.getTime())) return String(value)
    const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`
    return date.getFullYear() === new Date().getFullYear() ? base : `${base} ${date.getFullYear()}`
}

/** "26 Sep 2026, 14:03". */
export function formatDayTime(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined || value === "") return ""
    const date = toDate(value)
    if (Number.isNaN(date.getTime())) return String(value)
    const hh = String(date.getHours()).padStart(2, "0")
    const mm = String(date.getMinutes()).padStart(2, "0")
    return `${formatDay(date)}, ${hh}:${mm}`
}

/** "Sep 2026", for chart axes and period labels. */
export function formatMonth(value: string | number | Date): string {
    const date = toDate(value)
    return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * A session or event name as it reads on screen: title case, without the date
 * older records appended ("sunday service — 2026-09-27"), since the date is
 * always shown beside it. Display only.
 */
export function sessionName(value: string | null | undefined): string {
    return titleCase((value ?? "").replace(/\s*[-—–]\s*\d{4}-\d{2}-\d{2}\s*$/, ""))
}
