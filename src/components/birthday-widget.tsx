"use client"

import { useEffect, useState } from "react"
import { Cake } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { BirthdayCard } from "@/components/birthday-card"
import { getUpcomingBirthdays } from "@/lib/birthday-utils"
import type { Member } from "@/types/database"
import type { BirthdayMember } from "@/lib/birthday-utils"

interface BirthdayWidgetProps {
    members: Member[]
}

function Title() {
    return (
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Cake className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Upcoming birthdays
        </CardTitle>
    )
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

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <Title />
                    <CardDescription>Loading birthdays…</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <Skeleton className="h-10 w-10 rounded-full" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4" />
                                    <Skeleton className="h-3 w-2/3" />
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
            <Card>
                <CardHeader>
                    <Title />
                    <CardDescription>Members with a birthday this month or next</CardDescription>
                </CardHeader>
                <CardContent>
                    <EmptyState
                        icon={Cake}
                        title="No birthdays coming up"
                        description="Add birthdays to member profiles and they'll show up here."
                        className="py-8"
                    />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <Title />
                <CardDescription>
                    {todaysBirthdays.length > 0 && `${todaysBirthdays.length} today, `}
                    {birthdays.length} this month or next
                </CardDescription>
                {birthdays.length > 6 && upcomingBirthdays.length > 0 && (
                    <CardAction>
                        <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
                            {showAll ? "Show fewer" : `Show all (${birthdays.length})`}
                        </Button>
                    </CardAction>
                )}
            </CardHeader>

            <CardContent className="space-y-6">
                {todaysBirthdays.length > 0 && (
                    <section className="space-y-3">
                        <h4 className="text-sm font-medium text-foreground">Today</h4>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {todaysBirthdays.map((birthday, index) => (
                                <BirthdayCard key={birthday.id} member={birthday} index={index} />
                            ))}
                        </div>
                    </section>
                )}

                {upcomingBirthdays.length > 0 && (
                    <section className="space-y-3">
                        {todaysBirthdays.length > 0 && (
                            <h4 className="text-sm font-medium text-foreground">Coming up</h4>
                        )}
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {(showAll ? upcomingBirthdays : upcomingBirthdays.slice(0, 6)).map((birthday, index) => (
                                <BirthdayCard key={birthday.id} member={birthday} index={index} />
                            ))}
                        </div>
                    </section>
                )}
            </CardContent>
        </Card>
    )
}
