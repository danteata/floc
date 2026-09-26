'use client'

import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import { QrCode, RefreshCw, Lock, Unlock, Loader2, Users, Clock, Monitor } from "lucide-react"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { SessionQrCode } from "@/components/check-in/session-qr-code"

type SessionState = {
    sessionId: string | null
    token: string | null
    qrUrl: string | null
    display_name: string | null
    status: string | null
}

export function CheckInQrPanel({ eventTypes }: { eventTypes: { _id: string; label: string; value: string }[] }) {
    const [selectedEventTypeId, setSelectedEventTypeId] = useState<string>("")
    const [date, setDate] = useState<string>(() => new Date().toISOString().split("T")[0])
    const [displayName, setDisplayName] = useState<string>("")
    const [closesAt, setClosesAt] = useState<string>("")
    const [session, setSession] = useState<SessionState>({
        sessionId: null,
        token: null,
        qrUrl: null,
        display_name: null,
        status: null,
    })
    const [creating, setCreating] = useState(false)

    const createOrOpen = useMutation(api.check_ins.createOrOpenSession)
    const close = useMutation(api.check_ins.closeSession)
    const regenerate = useMutation(api.check_ins.regenerateToken)
    const liveStats = useQuery(
        api.check_ins.getLiveSessionStats,
        session.sessionId ? { sessionId: session.sessionId as any } : "skip",
    )

    const canCreate = useMemo(
        () => !!selectedEventTypeId && !!date && !creating,
        [selectedEventTypeId, date, creating],
    )

    const handleCreateOrOpen = async () => {
        if (!selectedEventTypeId) return
        setCreating(true)
        try {
            const result = await createOrOpen({
                date,
                event_type_id: selectedEventTypeId as any,
                display_name: displayName || undefined,
                closes_at: closesAt ? new Date(closesAt).toISOString() : undefined,
            })
            setSession({
                sessionId: result.sessionId as string,
                token: result.token,
                qrUrl: result.qrUrl,
                display_name: displayName || result.qrUrl,
                status: "open",
            })
            toast.success(result.created ? "Check-in session opened" : "Existing session reopened")
        } catch (err: any) {
            toast.error(err.message ?? "Failed to open session")
        } finally {
            setCreating(false)
        }
    }

    const handleClose = async () => {
        if (!session.sessionId) return
        try {
            await close({ sessionId: session.sessionId as any })
            setSession((s) => ({ ...s, status: "closed" }))
            toast.success("Session closed")
        } catch (err: any) {
            toast.error(err.message ?? "Failed to close session")
        }
    }

    const handleRegenerate = async () => {
        if (!session.sessionId) return
        try {
            const result = await regenerate({ sessionId: session.sessionId as any })
            setSession((s) => ({ ...s, token: result.token, qrUrl: result.qrUrl }))
            toast.success("QR code regenerated")
        } catch (err: any) {
            toast.error(err.message ?? "Failed to regenerate")
        }
    }

    const isOpen = session.status === "open"

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            {/* Setup / control card */}
            <Card className="border-border/50 rounded-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <QrCode className="h-4 w-4" />
                        Check-in Session
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="event-type">Event type</Label>
                        <Select value={selectedEventTypeId} onValueChange={setSelectedEventTypeId}>
                            <SelectTrigger id="event-type" className="w-full">
                                <SelectValue placeholder="Select event type" />
                            </SelectTrigger>
                            <SelectContent>
                                {eventTypes.map((et) => (
                                    <SelectItem key={et._id} value={et._id}>{et.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="display-name">Display name (optional)</Label>
                        <Input
                            id="display-name"
                            placeholder="e.g. Sunday Service — Jul 7"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="closes-at">Closes at (optional, defaults to +4h)</Label>
                        <Input
                            id="closes-at"
                            type="datetime-local"
                            value={closesAt}
                            onChange={(e) => setClosesAt(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                        <Button onClick={handleCreateOrOpen} disabled={!canCreate}>
                            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isOpen ? "Reopen / New" : "Open session"}
                        </Button>
                        {session.sessionId && (
                            <>
                                <Button variant="outline" onClick={handleRegenerate} disabled={!isOpen}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Regenerate QR
                                </Button>
                                <Button variant="outline" onClick={handleClose} disabled={!isOpen}>
                                    <Lock className="mr-2 h-4 w-4" />
                                    Close
                                </Button>
                                <Link to={`/kiosk/${session.sessionId}`} target="_blank">
                                    <Button variant="outline" disabled={!isOpen}>
                                        <Monitor className="mr-2 h-4 w-4" />
                                        Open Kiosk
                                    </Button>
                                </Link>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* QR display + live stats */}
            <Card className="border-border/50 rounded-lg">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                        <span className="flex items-center gap-2">
                            <QrCode className="h-4 w-4" />
                            {session.display_name ?? "QR Code"}
                        </span>
                        {session.sessionId && (
                            <Badge variant={isOpen ? "default" : "secondary"} className={cn(isOpen && "bg-success/15 text-success border-success/30")}>
                                {isOpen ? <Unlock className="mr-1 h-3 w-3" /> : <Lock className="mr-1 h-3 w-3" />}
                                {session.status}
                            </Badge>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                    {session.qrUrl ? (
                        <>
                            <SessionQrCode qrUrl={session.qrUrl} />
                            <p className="text-xs text-muted-foreground text-center max-w-xs">
                                Members scan this with their phone camera. They must be signed in to check in.
                            </p>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                            <QrCode className="h-10 w-10 mb-2 opacity-40" />
                            <p className="text-sm">Open a session to display the QR code</p>
                        </div>
                    )}

                    {session.sessionId && liveStats && (
                        <div className="w-full grid grid-cols-2 gap-3 pt-2">
                            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <div>
                                    <div className="text-lg font-semibold">{liveStats.check_in_count}</div>
                                    <div className="text-xs text-muted-foreground">checked in</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 rounded-md border border-border/50 p-3">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <div className="text-xs text-muted-foreground">
                                    Live roster below
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Live check-in list */}
            {session.sessionId && liveStats && liveStats.recent.length > 0 && (
                <Card className="border-border/50 rounded-lg lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Users className="h-4 w-4" />
                            Live Check-ins
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="divide-y divide-border/40">
                            {liveStats.recent.map((r: any) => (
                                <div key={r.member_id + (r.checked_in_at ?? "")} className="flex items-center justify-between py-2 text-sm">
                                    <span className="font-medium">{r.member_name ?? "Unknown"}</span>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                        {r.is_late && <Badge variant="outline" className="text-warning-strong border-warning/30">late</Badge>}
                                        <Badge variant="secondary" className="uppercase">{r.source}</Badge>
                                        {r.checked_in_at && (
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {new Date(r.checked_in_at).toLocaleTimeString()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}