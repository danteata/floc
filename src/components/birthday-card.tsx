"use client"

import { MemberAvatar } from "@/components/ui/member-avatar"
import { Badge } from "@/components/ui/badge"
import type { BirthdayMember } from "@/lib/birthday-utils"
import { cn } from "@/lib/utils"

interface BirthdayCardProps {
    member: BirthdayMember
    index?: number
}

/** "27 September", as the rest of the app writes dates. */
function birthdayDate(month: number, day: number): string {
    return new Date(2000, month - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
}

/** "Today", "Tomorrow", "In 5 days": plain words, no emoji or exclamation marks. */
function whenLabel(daysUntil: number, isToday: boolean): string {
    if (isToday || daysUntil === 0) return "Today"
    if (daysUntil === 1) return "Tomorrow"
    return `In ${daysUntil} days`
}

// `index` is kept for callers; cards no longer stagger their entrance.
export function BirthdayCard({ member }: BirthdayCardProps) {
    const when = whenLabel(member.daysUntilBirthday, member.isToday)
    const formattedDate = birthdayDate(member.birth_month, member.birth_day)

    return (
        <div
            className={cn(
                "flex min-w-0 items-center gap-3 rounded-lg border p-3",
                member.isToday ? "border-primary/40 bg-primary/5" : "border-border bg-card"
            )}
        >
            <MemberAvatar name={member.name} src={member.avatar_url || member.avatar} size="lg" />

            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{member.name}</p>
                    {member.age && (
                        <Badge variant="secondary" className="shrink-0">
                            Age {member.age}
                        </Badge>
                    )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{formattedDate}</p>
                <p
                    className={cn(
                        "mt-0.5 text-xs",
                        member.isToday
                            ? "font-medium text-primary"
                            : member.daysUntilBirthday <= 7
                                ? "text-warning-strong"
                                : "text-muted-foreground"
                    )}
                >
                    {when}
                </p>
            </div>
        </div>
    )
}
