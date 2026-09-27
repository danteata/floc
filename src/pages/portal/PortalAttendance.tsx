'use client'

import { useQuery } from "convex/react"
import { CalendarCheck, CheckCircle2, Clock, QrCode } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { checkInSourceLabel, formatDay, formatTime, titleCase } from "./format"

export default function PortalAttendance() {
    const history = useQuery(api.check_ins.getMyAttendanceHistory, { limit: 50 })

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                    My attendance
                </CardTitle>
            </CardHeader>
            <CardContent>
                {history === undefined ? (
                    <div className="space-y-2">
                        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                ) : history.length === 0 ? (
                    <EmptyState
                        icon={CalendarCheck}
                        title="No attendance yet"
                        description="Scan the QR code at church when you arrive, and each check-in will show here."
                    />
                ) : (
                    <div className="divide-y divide-border/40">
                        {history.map((h: any, i: number) => (
                            <div key={i} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-3">
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{titleCase(h.event_type_label) || "Event"}</p>
                                        <p className="text-xs text-muted-foreground">{formatDay(h.date)}</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 pl-7 text-xs text-muted-foreground sm:pl-0">
                                    {h.is_late && (
                                        <Badge className="bg-warning/15 text-warning-strong">
                                            <Clock /> Late
                                        </Badge>
                                    )}
                                    <Badge variant="secondary">
                                        {h.source === "qr" || h.source === "portal" ? <QrCode /> : null}
                                        {checkInSourceLabel(h.source)}
                                    </Badge>
                                    {h.checked_in_at && (
                                        <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {formatTime(h.checked_in_at)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
