'use client'

import { useState, useMemo, useRef, useEffect } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { useQuery, useMutation } from "convex/react"
import QRCode from "qrcode"
import {
    Search,
    UserPlus,
    CheckCircle2,
    Clock,
    Users,
    Loader2,
    ArrowLeft,
    X,
    UserCheck,
} from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type SearchResult = {
    member_id: string
    name: string
    other_names?: string
    email?: string
    phone?: string
    status: string
    already_checked_in: boolean
}

type RosterEntry = {
    member_id: string
    member_name: string
    member_status: string | null
    source?: string
    checked_in_at?: string
    is_late?: boolean
}

export default function KioskPage() {
    const { sessionId } = useParams<{ sessionId: string }>()
    const navigate = useNavigate()
    const session = useQuery(
        api.check_ins.kioskGetSession,
        sessionId ? { sessionId: sessionId as any } : "skip",
    )
    const roster = useQuery(
        api.check_ins.kioskLiveRoster,
        sessionId ? { sessionId: sessionId as any } : "skip",
    )

    const [search, setSearch] = useState("")
    const [showVisitorForm, setShowVisitorForm] = useState(false)
    const [lastCheckIn, setLastCheckIn] = useState<{
        memberId: string
        name: string
        status: string
        is_late: boolean
        created_new?: boolean
    } | null>(null)
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)

    const searchResults = useQuery(
        api.check_ins.kioskSearchMembers,
        sessionId && search.trim().length >= 2
            ? { sessionId: sessionId as any, query: search }
            : "skip",
    )

    const checkInMember = useMutation(api.check_ins.kioskCheckIn)
    const checkInVisitor = useMutation(api.check_ins.kioskCheckInVisitor)

    // "Also check in" suggestions: other household members not yet present
    // for this session. Convex reactivity drops a member from this list the
    // moment they're checked in, so no manual state juggling is needed.
    const householdSuggestions = useQuery(
        api.households.getUncheckedHouseholdMembers,
        lastCheckIn?.memberId && session?.attendance_id
            ? {
                  member_id: lastCheckIn.memberId as Id<"members">,
                  attendance_id: session.attendance_id as Id<"attendance">,
              }
            : "skip",
    )

    const handleCheckInSuggested = async (suggestion: { id: string; name: string }) => {
        if (!sessionId) return
        try {
            const res: any = await checkInMember({
                sessionId: sessionId as any,
                memberId: suggestion.id as any,
            })
            if (res.status === "checked_in" || res.status === "already_checked_in") {
                toast.success(`Checked in: ${res.member_name ?? suggestion.name}`)
            } else {
                toast.error(res.status ?? "Check-in failed")
            }
        } catch (err: any) {
            toast.error(err?.message ?? "Check-in failed")
        }
    }

    // Big QR for the kiosk screen — kiosk needs the token, so we regenerate one
    // for display. Simpler: derive a short-lived display URL via regenerate is
    // too churny; instead the kiosk links members to the portal where they can
    // self-check-in. We surface the session display info + a "scan at door"
    // hint. (QR for self-service is shown by the admin QR panel, not kiosk.)
    useEffect(() => {
        if (!session) return
        // No-op placeholder: kiosk focuses on steward-assisted check-in.
    }, [session])

    const isOpen = session?.status === "open"
    const sessionLoading = session === undefined

    const handleCheckInMember = async (member: SearchResult) => {
        if (!sessionId) return
        try {
            const res: any = await checkInMember({
                sessionId: sessionId as any,
                memberId: member.member_id as any,
            })
            handleResult(res, member.name, member.member_id)
            setSearch("")
            searchInputRef.current?.focus()
        } catch (err: any) {
            toast.error(err?.message ?? "Check-in failed")
        }
    }

    const handleResult = (res: any, fallbackName: string, memberId?: string) => {
        if (res.status === "checked_in") {
            setLastCheckIn({
                memberId: memberId ?? "",
                name: res.member_name ?? fallbackName,
                status: "checked_in",
                is_late: res.is_late,
                created_new: res.created_new,
            })
            toast.success(`Checked in: ${res.member_name ?? fallbackName}`)
        } else if (res.status === "already_checked_in") {
            setLastCheckIn({
                memberId: memberId ?? "",
                name: res.member_name ?? fallbackName,
                status: "already_checked_in",
                is_late: res.is_late,
            })
            toast.info(`Already checked in: ${res.member_name ?? fallbackName}`)
        } else if (res.status === "session_closed") {
            toast.error("Session is closed")
        } else if (res.status === "event_not_applicable") {
            toast.error("This event doesn't apply to that member")
        } else if (res.status === "wrong_org") {
            toast.error("Member belongs to a different organization")
        } else if (res.status === "out_of_scope") {
            toast.error("That member isn't in a unit you manage")
        } else {
            toast.error(res.status ?? "Check-in failed")
        }
        // Auto-clear the success banner after a few seconds.
        setTimeout(() => setLastCheckIn(null), 4000)
    }

    if (sessionLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-muted/20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!session) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-muted/20 p-6 gap-4">
                <p className="text-sm text-muted-foreground">Session not found.</p>
                <Link to="/attendance">
                    <Button variant="outline" size="sm">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to attendance
                    </Button>
                </Link>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-muted/20 flex flex-col">
            {/* Kiosk header */}
            <header className="border-b bg-background px-6 py-3 flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <Link to="/attendance" className="text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <div>
                        <h1 className="text-lg font-semibold leading-tight">{session.display_name}</h1>
                        <p className="text-xs text-muted-foreground">
                            {session.organization_name} · {session.date}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <Badge variant={isOpen ? "default" : "secondary"} className={cn(isOpen && "bg-success/15 text-success border-success/30")}>
                        {session.status}
                    </Badge>
                    <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">{session.check_in_count}</span>
                        <span className="text-muted-foreground">checked in</span>
                    </div>
                </div>
            </header>

            {/* Success / already-checked-in banner */}
            {lastCheckIn && (
                <div className="px-6 pt-4">
                    <div
                        className={cn(
                            "rounded-xl border p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300",
                            lastCheckIn.status === "checked_in"
                                ? "border-success/30 bg-success/10"
                                : "border-primary/20 bg-primary/5",
                        )}
                    >
                        <CheckCircle2
                            className={cn(
                                "h-8 w-8",
                                lastCheckIn.status === "checked_in" ? "text-success" : "text-primary",
                            )}
                        />
                        <div className="flex-1">
                            <p className="font-semibold text-lg">{lastCheckIn.name}</p>
                            <p className="text-sm text-muted-foreground">
                                {lastCheckIn.status === "checked_in"
                                    ? lastCheckIn.created_new
                                        ? "Welcome! New visitor checked in."
                                        : "Checked in."
                                    : "Already checked in."}
                                {lastCheckIn.is_late && (
                                    <span className="ml-2 text-warning-strong flex items-center gap-1 inline-flex">
                                        <Clock className="h-3 w-3" /> late
                                    </span>
                                )}
                            </p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setLastCheckIn(null)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    {householdSuggestions && householdSuggestions.length > 0 && (
                        <div className="mt-2 rounded-xl border border-dashed p-3 flex items-center gap-3 flex-wrap">
                            <span className="text-sm text-muted-foreground">Also check in:</span>
                            {householdSuggestions.map((s) => (
                                <Button
                                    key={s.id}
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleCheckInSuggested(s)}
                                >
                                    <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                                    {s.name}
                                </Button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="flex-1 grid gap-6 p-6 lg:grid-cols-[1fr_360px]">
                {/* Search + results */}
                <div className="flex flex-col gap-4">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
                        <Input
                            ref={searchInputRef}
                            autoFocus
                            placeholder="Type a name, phone, or email…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-16 pl-14 text-lg rounded-xl"
                            disabled={!isOpen}
                        />
                        {search && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10"
                                onClick={() => {
                                    setSearch("")
                                    searchInputRef.current?.focus()
                                }}
                            >
                                <X className="h-5 w-5" />
                            </Button>
                        )}
                    </div>

                    {/* Search results */}
                    {search.trim().length >= 2 && (
                        <div className="space-y-2">
                            {searchResults === undefined ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                                </div>
                            ) : searchResults.length === 0 ? (
                                <Card className="border-dashed">
                                    <CardContent className="p-6 text-center">
                                        <p className="text-sm text-muted-foreground mb-3">
                                            No matching member found for “{search}”.
                                        </p>
                                        <Button onClick={() => setShowVisitorForm(true)} disabled={!isOpen}>
                                            <UserPlus className="mr-2 h-4 w-4" />
                                            Check in as visitor
                                        </Button>
                                    </CardContent>
                                </Card>
                            ) : (
                                <>
                                    {searchResults.map((r: SearchResult) => (
                                        <button
                                            key={r.member_id}
                                            onClick={() => handleCheckInMember(r)}
                                            disabled={r.already_checked_in || !isOpen}
                                            className={cn(
                                                "w-full text-left rounded-xl border bg-background p-4 flex items-center justify-between transition-colors",
                                                r.already_checked_in
                                                    ? "opacity-60 cursor-default"
                                                    : "hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10",
                                                !isOpen && "opacity-50",
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
                                                    {r.name.slice(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-base">
                                                        {r.name}
                                                        {r.other_names ? ` ${r.other_names}` : ""}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {r.phone ?? r.email ?? "No contact"}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {r.status === "visitor" && (
                                                    <Badge variant="outline">visitor</Badge>
                                                )}
                                                {r.already_checked_in ? (
                                                    <Badge variant="secondary" className="gap-1">
                                                        <CheckCircle2 className="h-3 w-3" /> in
                                                    </Badge>
                                                ) : (
                                                    <span className="text-sm text-primary flex items-center gap-1">
                                                        <UserCheck className="h-4 w-4" /> Check in
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                    <div className="pt-2">
                                        <Button variant="outline" onClick={() => setShowVisitorForm(true)} disabled={!isOpen}>
                                            <UserPlus className="mr-2 h-4 w-4" />
                                            Not in the list? Check in as visitor
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Idle hint when no search */}
                    {search.trim().length < 2 && !lastCheckIn && (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                            <Search className="h-10 w-10 mb-2 opacity-40" />
                            <p className="text-sm">Start typing to find a member to check in.</p>
                            <Button
                                variant="outline"
                                className="mt-4"
                                onClick={() => setShowVisitorForm(true)}
                                disabled={!isOpen}
                            >
                                <UserPlus className="mr-2 h-4 w-4" />
                                Check in a visitor
                            </Button>
                        </div>
                    )}
                </div>

                {/* Live roster sidebar */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold flex items-center gap-2">
                            <Users className="h-4 w-4" /> Recently checked in
                        </h2>
                        <Badge variant="secondary">{roster?.length ?? 0}</Badge>
                    </div>
                    <div className="rounded-xl border bg-background flex-1 overflow-y-auto max-h-[60vh]">
                        {roster === undefined ? (
                            <div className="p-6 flex justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : roster.length === 0 ? (
                            <div className="p-8 text-center text-sm text-muted-foreground">
                                No one checked in yet.
                            </div>
                        ) : (
                            <div className="divide-y">
                                {roster.map((r: RosterEntry) => (
                                    <div key={r.member_id + (r.checked_in_at ?? "")} className="p-3 flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium">{r.member_name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {r.checked_in_at
                                                    ? new Date(r.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                                    : "—"}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {r.is_late && (
                                                <Badge variant="outline" className="text-warning-strong border-warning/30">late</Badge>
                                            )}
                                            {r.member_status === "visitor" && (
                                                <Badge variant="outline">visitor</Badge>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Visitor form dialog */}
            {showVisitorForm && (
                <VisitorDialog
                    onClose={() => setShowVisitorForm(false)}
                    initialName={search}
                    onSubmit={async (name, phone, email) => {
                        if (!sessionId) return
                        try {
                            const res: any = await checkInVisitor({
                                sessionId: sessionId as any,
                                name,
                                phone: phone || undefined,
                                email: email || undefined,
                            })
                            handleResult(res, name)
                            setShowVisitorForm(false)
                            setSearch("")
                            searchInputRef.current?.focus()
                        } catch (err: any) {
                            toast.error(err?.message ?? "Visitor check-in failed")
                        }
                    }}
                />
            )}
        </div>
    )
}

function VisitorDialog({
    onClose,
    initialName,
    onSubmit,
}: {
    onClose: () => void
    initialName: string
    onSubmit: (name: string, phone: string, email: string) => void
}) {
    const [name, setName] = useState(initialName)
    const [phone, setPhone] = useState("")
    const [email, setEmail] = useState("")
    const [submitting, setSubmitting] = useState(false)

    const canSubmit = name.trim().length > 0 && !submitting

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!canSubmit) return
        setSubmitting(true)
        try {
            await onSubmit(name.trim(), phone.trim(), email.trim())
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-background rounded-2xl shadow-xl w-full max-w-md p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <UserPlus className="h-5 w-5" /> New visitor
                    </h2>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="vname">Full name *</Label>
                        <Input
                            id="vname"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                            placeholder="e.g. Kwame Mensah"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="vphone">Phone (helps us recognize them next time)</Label>
                        <Input
                            id="vphone"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="e.g. +233 24 123 4567"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="vemail">Email (optional)</Label>
                        <Input
                            id="vemail"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="visitor@example.com"
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Visitors are saved as member records with “visitor” status. When they become a member,
                        their attendance history carries over — nothing is lost.
                    </p>
                    <div className="flex gap-2 pt-2">
                        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" className="flex-1" disabled={!canSubmit}>
                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Check in visitor
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    )
}