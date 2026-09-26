"use client"

import { useEffect, useState } from "react"
import { Cake, Calendar, Gift, Heart } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BirthdayCard } from "@/components/birthday-card"
import { getUpcomingBirthdays } from "@/lib/birthday-utils"
import type { Member } from "@/types/database"
import type { BirthdayMember } from "@/lib/birthday-utils"

interface BirthdayWidgetProps {
    members: Member[]
}

export function BirthdayWidget({ members }: BirthdayWidgetProps) {
    const [birthdays, setBirthdays] = useState<BirthdayMember[]>([])
    const [loading, setLoading] = useState(true)
    const [showAll, setShowAll] = useState(false)

    useEffect(() => {
        // Calculate upcoming birthdays
        const upcomingBirthdays = getUpcomingBirthdays(members)
        setBirthdays(upcomingBirthdays)
        setLoading(false)
    }, [members])

    const todaysBirthdays = birthdays.filter(b => b.isToday)
    const upcomingBirthdays = birthdays.filter(b => !b.isToday)
    const displayBirthdays = showAll ? birthdays : birthdays.slice(0, 6)

    if (loading) {
        return (
            <Card className="shadow-soft hover:shadow-soft-lg transition-all">
                <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent dark:from-primary/10 border-b border-border/50">
                    <CardTitle className="flex items-center gap-3">
                        <div className="p-2 bg-primary/15 text-primary dark:bg-primary/30 dark:text-primary rounded-lg">
                            <Cake className="h-5 w-5" />
                        </div>
                        Birthdays
                    </CardTitle>
                    <CardDescription>Loading celebrations...</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="flex items-center space-x-4">
                                <div className="h-10 w-10 bg-muted rounded-full animate-pulse" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-muted rounded animate-pulse" />
                                    <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (birthdays.length === 0) {
        return (
            <Card className="shadow-soft hover:shadow-soft-lg transition-all overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent dark:from-primary/10 border-b border-border/50">
                    <CardTitle className="flex items-center gap-3">
                        <div className="p-2 bg-primary/15 text-primary dark:bg-primary/30 dark:text-primary rounded-lg">
                            <Cake className="h-5 w-5" />
                        </div>
                        Birthdays
                    </CardTitle>
                    <CardDescription>No upcoming celebrations</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="text-center py-12">
                        <div className="inline-block p-4 bg-muted rounded-full mb-4">
                            <Gift className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">No birthday data available. Add member birthdays to see celebrations here!</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="shadow-soft hover:shadow-soft-lg transition-all overflow-hidden border-0">
            <CardHeader className="bg-gradient-to-r from-primary/50 via-primary/30 to-transparent dark:from-primary/10 dark:via-primary/5 border-b border-border/50">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-3">
                            <div className="p-2.5 bg-gradient-to-br from-primary/70 to-primary text-white rounded-xl shadow-md">
                                <Cake className="h-5 w-5" />
                            </div>
                            Birthday Celebrations
                        </CardTitle>
                        <CardDescription className="mt-2 flex items-center gap-2 flex-wrap">
                            {todaysBirthdays.length > 0 && (
                                <Badge variant="default" className="bg-primary hover:bg-primary border-none shadow-sm">
                                    🎉 {todaysBirthdays.length} TODAY!
                                </Badge>
                            )}
                            <span className="font-medium text-foreground text-sm">
                                {birthdays.length} upcoming birthdays
                            </span>
                        </CardDescription>
                    </div>
                    <div className="p-2 bg-primary/15 text-primary dark:bg-primary/20 dark:text-primary rounded-lg animate-pulse">
                        <Heart className="h-5 w-5 fill-current" />
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-6 space-y-8">
                {/* Today's Birthdays - Special Highlight */}
                {todaysBirthdays.length > 0 && (
                    <div className="relative">
                        <div className="absolute -left-2 top-0 bottom-0 w-1 bg-gradient-to-b from-primary to-primary rounded-full opacity-50"></div>
                        <div className="pl-4">
                            <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 bg-primary/15 dark:bg-primary/30 text-primary dark:text-primary rounded-full text-xs font-semibold">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>Today's Celebrations!</span>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {todaysBirthdays.map((birthday, index) => (
                                    <BirthdayCard key={birthday.id} member={birthday} index={index} />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Upcoming Birthdays */}
                {upcomingBirthdays.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-secondary text-secondary-foreground rounded-full text-xs font-semibold">
                                <Gift className="h-3.5 w-3.5" />
                                <span>Coming Up</span>
                            </div>
                            {birthdays.length > 6 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowAll(!showAll)}
                                    className="text-xs h-8 hover:bg-transparent hover:text-primary hover:underline"
                                >
                                    {showAll ? 'Show Less' : `Show All (${birthdays.length})`}
                                </Button>
                            )}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {(showAll ? upcomingBirthdays : upcomingBirthdays.slice(0, 6)).map((birthday, index) => (
                                <BirthdayCard key={birthday.id} member={birthday} index={index} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty State for Upcoming */}
                {todaysBirthdays.length === 0 && upcomingBirthdays.length === 0 && (
                    <div className="text-center py-6">
                        <div className="inline-block p-3 bg-muted rounded-full mb-3">
                            <Gift className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                        <p className="text-sm text-muted-foreground">No upcoming birthdays in the next few months.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}