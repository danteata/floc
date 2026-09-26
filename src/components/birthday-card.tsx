"use client"

import { useState } from "react"
import { Cake, Heart, Sparkles } from "lucide-react"
import { MemberAvatar } from "@/components/ui/member-avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { BirthdayMember } from "@/lib/birthday-utils"
import { formatBirthdayDate, getBirthdayMessage } from "@/lib/birthday-utils"
import { cn } from "@/lib/utils"

interface BirthdayCardProps {
    member: BirthdayMember
    index?: number
}

export function BirthdayCard({ member, index }: BirthdayCardProps) {
    const [isHovered, setIsHovered] = useState(false)

    const birthdayMessage = getBirthdayMessage(member.daysUntilBirthday, member.isToday)
    const formattedDate = formatBirthdayDate(member.birth_month, member.birth_day)

    return (
        <Card
            className={cn(
                "relative overflow-hidden transition-all duration-300 rounded-xl border border-border bg-card",
                member.isToday
                    ? 'ring-2 ring-primary/20 shadow-lg shadow-pink-500/10'
                    : 'hover:shadow-soft-lg hover:-translate-y-1'
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Gradient accent bar for today */}
            {member.isToday && (
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary to-primary" />
            )}

            {/* Floating sparkles animation */}
            {isHovered && member.isToday && (
                <div className="absolute inset-0 pointer-events-none fade-in">
                    <Sparkles className="absolute top-2 right-2 h-4 w-4 text-primary animate-pulse" />
                    <Sparkles className="absolute top-8 left-4 h-3 w-3 text-primary animate-pulse delay-100" />
                    <Sparkles className="absolute bottom-4 right-8 h-3 w-3 text-warning animate-pulse delay-200" />
                </div>
            )}

            <CardContent className="p-4 relative z-10">
                <div className="flex items-center space-x-3">
                    {/* Avatar with special styling for today */}
                    <div className="relative">
                        <MemberAvatar
                            name={member.name}
                            src={member.avatar_url || member.avatar}
                            size="lg"
                            className={cn(
                                "transition-all duration-300 border-2 border-background",
                                member.isToday ? 'ring-2 ring-primary' : 'ring-1 ring-border',
                                isHovered ? 'scale-105' : ''
                            )}
                        />

                        {/* Birthday cake icon for today's birthdays */}
                        {member.isToday && (
                            <div className="absolute -top-1 -right-1 bg-white dark:bg-card rounded-full p-0.5 shadow-sm">
                                <div className="bg-gradient-to-br from-primary to-primary text-white rounded-full p-1">
                                    <Cake className="h-2.5 w-2.5" />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                            <h3 className={cn(
                                "font-semibold truncate transition-colors",
                                member.isToday ? 'text-primary dark:text-primary' : 'text-foreground',
                                isHovered && !member.isToday ? 'text-primary' : ''
                            )}>
                                {member.name}
                            </h3>

                            {/* Age badge if available */}
                            {member.age && (
                                <Badge
                                    variant={member.isToday ? "default" : "secondary"}
                                    className={cn(
                                        "text-[10px] px-1.5 h-5 ml-2",
                                        member.isToday ? "bg-primary hover:bg-primary" : ""
                                    )}
                                >
                                    {member.age}
                                </Badge>
                            )}
                        </div>

                        <div className="text-xs text-muted-foreground mt-0.5">
                            {formattedDate}
                        </div>

                        <div className={cn(
                            "text-xs mt-1 transition-colors duration-300",
                            member.isToday
                                ? 'text-primary dark:text-primary'
                                : member.daysUntilBirthday <= 7
                                    ? 'text-warning-strong dark:text-warning'
                                    : 'text-muted-foreground/70'
                        )}>
                            {birthdayMessage}
                        </div>
                    </div>
                </div>

                {/* Heart animation for today's birthdays */}
                {member.isToday && (
                    <div className="absolute bottom-2 right-2 opacity-10">
                        <Heart className="h-6 w-6 text-primary animate-pulse" />
                    </div>
                )}
            </CardContent>
        </Card>
    )
}