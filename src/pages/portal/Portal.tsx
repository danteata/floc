'use client'

import { useQuery } from "convex/react"
import { Link } from "react-router-dom"
import { QrCode, Calendar, CalendarCheck } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { checkInSourceLabel, formatDay, formatDayTime, titleCase } from "./format"

export default function PortalDashboard() {
    const upcoming = useQuery(api.check_ins.getMyUpcomingSessions, { limit: 5 })
    const history = useQuery(api.check_ins.getMyAttendanceHistory, { limit: 3 })

    const hasUpcoming = upcoming && upcoming.length > 0
    const openSession = hasUpcoming ? upcoming.find((s: any) => s.status === "open") : null

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* Current check-in card */}
            <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                        <QrCode className="h-4 w-4 text-muted-foreground" />
                        Check-in
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {openSession ? (
                        <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{titleCase(openSession.display_name)}</p>
                                <Badge className="bg-success/15 text-success-strong">Open now</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {[titleCase(openSession.event_type_label), formatDay(openSession.date)].filter(Boolean).join(" · ")}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Open until {formatDayTime(openSession.closes_at)}. Scan the QR code at the venue to check in.
                            </p>
                        </div>
                    ) : (
                        <EmptyState
                            icon={QrCode}
                            className="py-6"
                            title="Nothing to check in to right now"
                            description="When you arrive at church, scan the QR code on display to check in."
                        />
                    )}
                </CardContent>
            </Card>

            {/* Upcoming sessions */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        Coming up
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {upcoming === undefined ? (
                        <Skeleton className="h-12 w-full" />
                    ) : hasUpcoming ? (
                        upcoming.map((s: any) => (
                            <div key={s.sessionId} className="flex items-center justify-between gap-3 text-sm">
                                <div className="min-w-0">
                                    <p className="truncate font-medium">{titleCase(s.display_name)}</p>
                                    <p className="text-xs text-muted-foreground">{formatDay(s.date)}</p>
                                </div>
                                {s.status === "open" && (
                                    <Badge className="shrink-0 bg-success/15 text-success-strong">Open</Badge>
                                )}
                            </div>
                        ))
                    ) : (
                        <EmptyState
                            icon={Calendar}
                            className="py-6"
                            title="No events coming up"
                            description="Your church's next events will show here once they're scheduled."
                        />
                    )}
                </CardContent>
            </Card>

            {/* Recent attendance */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                        <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                        Recent attendance
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {history === undefined ? (
                        <Skeleton className="h-12 w-full" />
                    ) : history.length > 0 ? (
                        history.map((h: any, i: number) => (
                            <div key={i} className="flex items-center justify-between gap-3 text-sm">
                                <div className="min-w-0">
                                    <p className="truncate font-medium">{titleCase(h.event_type_label) || "Event"}</p>
                                    <p className="text-xs text-muted-foreground">{formatDay(h.date)}</p>
                                </div>
                                <span className="shrink-0 text-xs text-muted-foreground">{checkInSourceLabel(h.source)}</span>
                            </div>
                        ))
                    ) : (
                        <EmptyState
                            icon={CalendarCheck}
                            className="py-6"
                            title="No attendance yet"
                            description="Each time you check in at church, it will show here."
                        />
                    )}
                    {history !== undefined && history.length > 0 && (
                        <Button asChild variant="outline" size="sm" className="w-full">
                            <Link to="/portal/attendance">See all attendance</Link>
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
