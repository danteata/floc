'use client'

import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import {
    Users,
    UserPlus,
    Clock,
    AlertTriangle,
    QrCode,
    Lock,
    Unlock,
    Monitor,
    Link2,
    ChevronDown,
    Loader2,
    PlayCircle,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Id } from "../../../convex/_generated/dataModel"
import { LayoutWrapper } from "@/components/layout-wrapper"
import { useOrganization } from "@/hooks/use-organization"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, StatGrid } from "@/components/ui/stat-card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ShareAbsentLinkDialog } from "@/components/share-absent-link-dialog"
import { SessionQrCode } from "@/components/check-in/session-qr-code"
import { cn } from "@/lib/utils"

function eventTypeBadgeVariant(color: string | null | undefined) {
    if (color === "default") return "default" as const
    if (color === "secondary") return "secondary" as const
    if (color === "destructive") return "destructive" as const
    return "outline" as const
}

type StartedSession = {
    eventTypeId: string
    label: string
    qrUrl: string
}

export default function CommandCenterPage() {
    const { organization } = useOrganization()
    const [date] = useState<string>(() => new Date().toISOString().split("T")[0])
    const [showLate, setShowLate] = useState(false)
    const [showFailures, setShowFailures] = useState(false)
    const [startingEventTypeId, setStartingEventTypeId] = useState<string | null>(null)
    const [startedSession, setStartedSession] = useState<StartedSession | null>(null)

    const summary = useQuery(
        api.check_ins.getCommandCenterSummary,
        organization ? { organization_id: organization._id, date } : "skip",
    )

    const createOrOpen = useMutation(api.check_ins.createOrOpenSession)
    const closeSession = useMutation(api.check_ins.closeSession)

    const handleStart = async (eventTypeId: string, label: string) => {
        setStartingEventTypeId(eventTypeId)
        try {
            const result = await createOrOpen({
                date,
                event_type_id: eventTypeId as Id<"event_types">,
            })
            setStartedSession({ eventTypeId, label, qrUrl: result.qrUrl })
            toast.success(`${label} session opened`)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to open session")
        } finally {
            setStartingEventTypeId(null)
        }
    }

    const handleClose = async (sessionId: string) => {
        try {
            await closeSession({ sessionId: sessionId as Id<"check_in_sessions"> })
            toast.success("Session closed")
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to close session")
        }
    }

    const isLoading = summary === undefined

    return (
        <LayoutWrapper>
            <div className="space-y-6">
                <PageHeader
                    title="Command center"
                    description={
                        <>
                            Live for today,{" "}
                            {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
                                weekday: "long",
                                month: "long",
                                day: "numeric",
                            })}
                        </>
                    }
                />

                {isLoading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <>
                        <StatGrid>
                            <StatCard icon={Users} label="Checked in today" value={summary.totalHeadcount} />
                            <StatCard icon={UserPlus} label="First-timers today" value={summary.firstTimersToday} />
                            <StatCard
                                icon={Clock}
                                label="Late arrivals"
                                value={summary.lateArrivals.count}
                                onClick={
                                    summary.lateArrivals.count > 0 ? () => setShowLate((v) => !v) : undefined
                                }
                            />
                            <StatCard
                                icon={AlertTriangle}
                                label="Failed check-ins"
                                value={summary.recentFailures.length}
                                onClick={
                                    summary.recentFailures.length > 0
                                        ? () => setShowFailures((v) => !v)
                                        : undefined
                                }
                            />
                        </StatGrid>

                        {summary.lateArrivals.count > 0 && (
                            <Collapsible open={showLate} onOpenChange={setShowLate}>
                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
                                        <ChevronDown
                                            className={cn("h-3.5 w-3.5 transition-transform", showLate && "rotate-180")}
                                        />
                                        Late arrivals ({summary.lateArrivals.count})
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <Card className="border-border/50 rounded-lg mt-2">
                                        <CardContent className="divide-y divide-border/40 p-0">
                                            {summary.lateArrivals.list.map((l, i) => (
                                                <div
                                                    key={`${l.member_id}-${i}`}
                                                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                                                >
                                                    <span className="font-medium">{l.member_name ?? "Unknown"}</span>
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <span>{l.event_type_label ?? "—"}</span>
                                                        {typeof l.minutes_late === "number" && (
                                                            <Badge variant="outline" className="text-warning-strong border-warning/30">
                                                                {l.minutes_late}m late
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </CardContent>
                                    </Card>
                                </CollapsibleContent>
                            </Collapsible>
                        )}

                        {summary.recentFailures.length > 0 && (
                            <Collapsible open={showFailures} onOpenChange={setShowFailures}>
                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
                                        <ChevronDown
                                            className={cn(
                                                "h-3.5 w-3.5 transition-transform",
                                                showFailures && "rotate-180",
                                            )}
                                        />
                                        Failed check-ins ({summary.recentFailures.length})
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <Card className="border-border/50 rounded-lg mt-2">
                                        <CardContent className="divide-y divide-border/40 p-0">
                                            {summary.recentFailures.map((f, i) => (
                                                <div
                                                    key={i}
                                                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                                                >
                                                    <span className="font-medium">{f.member_name ?? "Unknown"}</span>
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <Badge variant="outline" className="uppercase">
                                                            {f.outcome.replace(/_/g, " ")}
                                                        </Badge>
                                                        <span>{new Date(f.timestamp).toLocaleTimeString()}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </CardContent>
                                    </Card>
                                </CollapsibleContent>
                            </Collapsible>
                        )}

                        <div>
                            <h2 className="text-sm font-semibold text-muted-foreground tracking-wide mb-3">
                                Today&apos;s sessions
                            </h2>
                            {summary.sessions.length === 0 ? (
                                <Card className="border-border/50 rounded-lg">
                                    <EmptyState
                                        icon={QrCode}
                                        title="No sessions today yet"
                                        description="Start one below to open check-in for a service."
                                    />
                                </Card>
                            ) : (
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {summary.sessions.map((s) => {
                                        const isOpen = s.status === "open"
                                        return (
                                            <Card key={s._id} className="border-border/50 rounded-lg">
                                                <CardHeader className="pb-3">
                                                    <CardTitle className="flex items-center justify-between text-sm">
                                                        <span className="flex items-center gap-2">
                                                            <Badge variant={eventTypeBadgeVariant(s.event_type_color)}>
                                                                {s.event_type_label ?? "Event"}
                                                            </Badge>
                                                        </span>
                                                        <Badge
                                                            variant={isOpen ? "default" : "secondary"}
                                                            className={cn(
                                                                isOpen && "bg-success/15 text-success border-success/30",
                                                            )}
                                                        >
                                                            {isOpen ? (
                                                                <Unlock className="mr-1 h-3 w-3" />
                                                            ) : (
                                                                <Lock className="mr-1 h-3 w-3" />
                                                            )}
                                                            {s.status}
                                                        </Badge>
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent className="space-y-3">
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <Users className="h-4 w-4 text-muted-foreground" />
                                                        <span className="font-semibold">{s.check_in_count ?? 0}</span>
                                                        <span className="text-muted-foreground">checked in</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {isOpen && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => handleClose(s._id)}
                                                            >
                                                                <Lock className="mr-1.5 h-3.5 w-3.5" />
                                                                Close
                                                            </Button>
                                                        )}
                                                        <Link to={`/kiosk/${s._id}`} target="_blank">
                                                            <Button variant="outline" size="sm">
                                                                <Monitor className="mr-1.5 h-3.5 w-3.5" />
                                                                Kiosk
                                                            </Button>
                                                        </Link>
                                                        {organization && s.event_type_value && (
                                                            <ShareAbsentLinkDialog
                                                                organizationId={organization._id}
                                                                eventType={s.event_type_value}
                                                                eventTypeLabel={s.event_type_label ?? "Service"}
                                                                date={new Date(`${date}T00:00:00`)}
                                                                trigger={
                                                                    <Button variant="outline" size="sm">
                                                                        <Link2 className="mr-1.5 h-3.5 w-3.5" />
                                                                        Absent link
                                                                    </Button>
                                                                }
                                                            />
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {summary.openableEventTypes.length > 0 && (
                            <div>
                                <h2 className="text-sm font-semibold text-muted-foreground tracking-wide mb-3">
                                    Start a session
                                </h2>
                                <div className="flex flex-wrap gap-2">
                                    {summary.openableEventTypes.map((et) => (
                                        <Button
                                            key={et._id}
                                            variant="outline"
                                            size="sm"
                                            disabled={startingEventTypeId === et._id}
                                            onClick={() => handleStart(et._id, et.label)}
                                        >
                                            {startingEventTypeId === et._id ? (
                                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                                            )}
                                            {et.label}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <Dialog open={!!startedSession} onOpenChange={(open) => !open && setStartedSession(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <QrCode className="h-4 w-4" />
                            {startedSession?.label}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col items-center gap-4">
                        <SessionQrCode qrUrl={startedSession?.qrUrl ?? null} />
                        <p className="text-xs text-muted-foreground text-center max-w-xs">
                            Members scan this with their phone camera to check in.
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </LayoutWrapper>
    )
}
