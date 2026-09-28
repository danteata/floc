/**
 * The first day a member can be counted absent: joined_date, else the day the
 * record was created. A member can't miss a service held before they joined.
 * Shared by the member profile, the Absent tab and the shared absent list so
 * "missed in a row" means the same everywhere.
 */
export function tenureStart(member: {
    joined_date?: string | null
    created_at?: string | number | null
    _creationTime?: number
}): string | null {
    if (member.joined_date) return member.joined_date.slice(0, 10)
    if (typeof member.created_at === "string" && member.created_at) return member.created_at.slice(0, 10)
    const ms = typeof member.created_at === "number" ? member.created_at : member._creationTime
    return ms ? new Date(ms).toISOString().slice(0, 10) : null
}
