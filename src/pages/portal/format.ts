// One date and title-case format across the app: these live in src/lib/display.
export { formatDay, formatDayTime, titleCase } from "@/lib/display"

/** A time of day as "09:15". */
export function formatTime(value?: number | string | null): string {
    if (value === null || value === undefined || value === "") return ""
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

/** How a check-in was recorded, as a member would say it. */
export function checkInSourceLabel(source?: string | null): string {
    switch (source) {
        case "qr":
            return "QR code"
        case "kiosk":
            return "Kiosk"
        case "portal":
            return "Portal"
        case "geofence":
            return "On arrival"
        default:
            return "Recorded by staff"
    }
}
