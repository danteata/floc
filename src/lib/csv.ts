/**
 * CSV helpers for the public share pages.
 *
 * These files leave the app for volunteers who open them in Excel or Sheets,
 * and every value in them is member-entered free text. That combination makes
 * two things matter here that a quick internal dump can get away with
 * ignoring: quoting that survives a comma or an apostrophe in someone's name,
 * and neutralising values a spreadsheet would treat as a formula.
 */

/**
 * Leading characters that make Excel and Sheets evaluate a cell instead of
 * showing it. `+` is the one that bites in practice: a phone number saved as
 * "+233..." is otherwise evaluated and comes out as a bare number.
 */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"]

function escapeCell(value: unknown): string {
    const raw = value === null || value === undefined ? "" : String(value)

    // A single leading quote keeps the text readable and inert — the
    // spreadsheet strips it on display but no longer evaluates the cell.
    const safe = FORMULA_PREFIXES.some((prefix) => raw.startsWith(prefix)) ? `'${raw}` : raw

    // RFC 4180: double any embedded quote, and wrap unconditionally so that a
    // value containing a comma or a newline needs no special case.
    return `"${safe.replace(/"/g, '""')}"`
}

/** Builds an RFC 4180 document. Row cells are stringified and escaped. */
export function toCsv(headers: string[], rows: unknown[][]): string {
    return [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n")
}

/** Reduces a title to something safe to hand to a filesystem. */
export function slugForFilename(value: string, fallback = "export"): string {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    return slug || fallback
}

/** Today as YYYY-MM-DD, for stamping a filename so downloads don't collide. */
export function todayStamp(): string {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    return `${now.getFullYear()}-${month}-${day}`
}

/** Triggers a download of `csv` as `filename`. */
export function downloadCsv(filename: string, csv: string): void {
    // The BOM is what tells Excel the file is UTF-8. Without it, any name
    // carrying an accent arrives mangled.
    const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}
