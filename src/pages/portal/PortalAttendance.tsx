'use client'

import { useQuery } from "convex/react"
import { Calendar, CheckCircle2, Clock, QrCode } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"

export default function PortalAttendance() {
    const history = useQuery(api.check_ins.getMyAttendanceHistory, { limit: 50 })

    return (
        <Card className="border-border/50 rounded-lg">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Calendar className="h-4 w-4" />
                    My Attendance History
                </CardTitle>
            </CardHeader>
            <CardContent>
                {history === undefined ? (
                    <div className="space-y-2">
                        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                ) : history.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                        No attendance recorded yet.
                    </p>
                ) : (
                    <div className="divide-y divide-border/40">
                        {history.map((h: any, i: number) => (
                            <div key={i} className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-3">
                                    <CheckCircle2 className="h-4 w-4 text-success" />
                                    <div>
                                        <p className="text-sm font-medium">{h.event_type_label ?? "Event"}</p>
                                        <p className="text-xs text-muted-foreground">{h.date}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {h.is_late && (
                                        <Badge variant="outline" className="text-warning-strong border-warning/30">
                                            <Clock className="mr-1 h-3 w-3" /> late
                                        </Badge>
                                    )}
                                    <Badge variant="secondary" className="uppercase flex items-center gap-1">
                                        {h.source === "qr" || h.source === "portal" ? <QrCode className="h-3 w-3" /> : null}
                                        {h.source ?? "manual"}
                                    </Badge>
                                    {h.checked_in_at && (
                                        <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {new Date(h.checked_in_at).toLocaleString()}
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