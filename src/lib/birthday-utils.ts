import type { Member } from "@/types/database"

export interface BirthdayMember {
    id: string
    name: string
    birth_month: number
    birth_day: number
    dob?: string
    avatar?: string
    avatar_url?: string
    initials: string
    age?: number
    daysUntilBirthday: number
    isToday: boolean
    birthdayThisYear: Date
}

/**
 * Calculate days until next birthday
 */
export function getDaysUntilBirthday(birthMonth: number, birthDay: number): number {
    const now = new Date()
    const currentYear = now.getFullYear()

    // Create birthday date for this year
    const birthdayThisYear = new Date(currentYear, birthMonth - 1, birthDay)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // If birthday has already passed this year (or is today but already passed in time), calculate for next year
    if (birthdayThisYear.getTime() < today.getTime()) {
        const birthdayNextYear = new Date(currentYear + 1, birthMonth - 1, birthDay)
        const diffTime = birthdayNextYear.getTime() - now.getTime()
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    } else {
        // Birthday is today or in the future this year
        const diffTime = birthdayThisYear.getTime() - now.getTime()
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    }
}

/**
 * Calculate age from birth date
 */
export function calculateAge(dob: string | Date): number {
    const birthDate = new Date(dob)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--
    }

    return age
}

/**
 * Check if today is the member's birthday
 */
export function isBirthdayToday(birthMonth: number, birthDay: number): boolean {
    const now = new Date()
    return now.getMonth() + 1 === birthMonth && now.getDate() === birthDay
}

/**
 * Get upcoming birthdays for current and next month
 */
export function getUpcomingBirthdays(members: Member[]): BirthdayMember[] {
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1

    const birthdayMembers: BirthdayMember[] = []

    // Process each member
    for (const member of members) {
        // Skip inactive members or those without birthday data
        if (member.status !== 'active' || (!member.birth_month && !member.dob)) {
            continue
        }

        let birthMonth = member.birth_month
        let birthDay = member.birth_day
        let age: number | undefined

        // If birth_month/birth_day not available, parse from dob
        if (!birthMonth && member.dob) {
            const dob = new Date(member.dob)
            birthMonth = dob.getMonth() + 1
            birthDay = dob.getDate()
        }

        // Skip if we still don't have valid birthday data
        if (!birthMonth || !birthDay) {
            continue
        }

        const daysUntilBirthday = getDaysUntilBirthday(birthMonth, birthDay)
        const isToday = isBirthdayToday(birthMonth, birthDay)

        // Calculate birthday date for this year
        const currentYear = now.getFullYear()
        const birthdayThisYear = new Date(currentYear, birthMonth - 1, birthDay)

        // The age they turn on the coming birthday: today's age on the day
        // itself, one more than today's age otherwise. This used to add one only
        // when the birthday had passed, so the card showed the age they already were.
        if (member.dob) {
            const current = calculateAge(member.dob)
            age = isToday ? current : current + 1
        }

        birthdayMembers.push({
            id: member.id || '',
            name: member.name,
            birth_month: birthMonth,
            birth_day: birthDay,
            dob: member.dob,
            avatar: member.avatar,
            avatar_url: member.avatar_url,
            initials: member.initials,
            age,
            daysUntilBirthday,
            isToday,
            birthdayThisYear
        })
    }

    // Birthdays still to come this month or next. Matching on the month alone
    // included birthdays earlier this month that had already passed, which then
    // showed as "in 340 days".
    return birthdayMembers
        .filter(member =>
            (member.birth_month === currentMonth || member.birth_month === nextMonth || member.daysUntilBirthday <= 30) &&
            member.daysUntilBirthday <= 62
        )
        .sort((a, b) => {
            // Sort by days until birthday, then by month/day
            if (a.daysUntilBirthday !== b.daysUntilBirthday) {
                return a.daysUntilBirthday - b.daysUntilBirthday
            }
            if (a.birth_month !== b.birth_month) {
                return a.birth_month - b.birth_month
            }
            return a.birth_day - b.birth_day
        })
        .slice(0, 12) // Limit to 12 birthdays for display
}
