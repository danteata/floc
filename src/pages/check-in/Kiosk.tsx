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
import { MemberAvatar } from "@/components/ui/member-avatar"
import { cn } from "@/lib/utils"
import { errorMessage } from "@/lib/errors"
import { toast } from "sonner"
import { formatDay, sessionName, titleCase } from '@/lib/display'

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
                toast.success(`${res.member_name ?? suggestion.name} is checked in`)
            } else {
                toast.error(`Couldn't check in ${suggestion.name}`, { description: checkInProblem(res.status) })
            }
        } catch (err: any) {
            toast.error(`Couldn't check in ${suggestion.name}`, { description: errorMessage(err, "Check the connection and try again.") })
        }
    }

    // Big QR for the kiosk screen: kiosk needs the token, so we regenerate one
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
            toast.error(`Couldn't check in ${member.name}`, { description: errorMessage(err, "Check the connection and try again.") })
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
            toast.success(`${res.member_name ?? fallbackName} is checked in`)
        } else if (res.status === "already_checked_in") {
            setLastCheckIn({
                memberId: memberId ?? "",
                name: res.member_name ?? fallbackName,
                status: "already_checked_in",
                is_late: res.is_late,
            })
            toast.info(`${res.member_name ?? fallbackName} is already checked in`)
        } else {
            toast.error(`Couldn't check in ${fallbackName}`, { description: checkInProblem(res.status) })
        }
        // Auto-clear the success banner after a few seconds.
        setTimeout(() => setLastCheckIn(null), 4000)
    }

    if (sessionLoading) {
        return (
            <div className="min-h-dvh flex items-center justify-center bg-muted/20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!session) {
        return (
            <div className="min-h-dvh flex flex-col items-center justify-center bg-muted/20 p-6 gap-4 text-center">
                <div className="space-y-1">
                    <p className="text-base font-semibold">We couldn't find this check-in</p>
                    <p className="text-sm text-muted-foreground">It may have been removed. Open the kiosk again from Attendance.</p>
                </div>
                <Button asChild variant="outline" className="h-11">
                    <Link to="/attendance">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to attendance
                    </Link>
                </Button>
            </div>
        )
    }

    return (
        <div className="min-h-dvh bg-muted/20 flex flex-col">
            {/* Kiosk header */}
            <header className="border-b bg-background px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sticky top-0 z-10">
                <div className="flex min-w-0 items-center gap-2">
                    <Link
                        to="/attendance"
                        aria-label="Back to attendance"
                        className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-semibold leading-tight">{sessionName(session.display_name)}</h1>
                        <p className="truncate text-xs text-muted-foreground">
                            {[session.organization_name, formatDay(session.date)].filter(Boolean).join(" · ")}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <Badge variant={isOpen ? "default" : "secondary"} className={cn(isOpen && "bg-success/15 text-success-strong")}>
                        {sessionStatusLabel(session.status)}
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
                <div className="px-4 pt-4 sm:px-6">
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
                                "h-8 w-8 shrink-0",
                                lastCheckIn.status === "checked_in" ? "text-success" : "text-primary",
                            )}
                        />
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-lg">{lastCheckIn.name}</p>
                            <p className="text-sm text-muted-foreground">
                                {lastCheckIn.status === "checked_in"
                                    ? lastCheckIn.created_new
                                        ? "Welcome. Checked in as a new visitor."
                                        : "Checked in."
                                    : "Already checked in."}
                                {lastCheckIn.is_late && (
                                    <span className="ml-2 inline-flex items-center gap-1 text-warning-strong">
                                        <Clock className="h-3 w-3" /> Late
                                    </span>
                                )}
                            </p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Dismiss" onClick={() => setLastCheckIn(null)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    {householdSuggestions && householdSuggestions.length > 0 && (
                        <div className="mt-2 rounded-xl border border-dashed p-3 flex items-center gap-3 flex-wrap">
                            <span className="text-sm text-muted-foreground">Check in their household too:</span>
                            {householdSuggestions.map((s) => (
                                <Button
                                    key={s.id}
                                    variant="outline"
                                    className="h-11"
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

            <div className="flex-1 grid gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_360px]">
                {/* Search + results */}
                <div className="flex flex-col gap-4">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground" />
                        <Input
                            ref={searchInputRef}
                            autoFocus
                            placeholder="Type a name, phone or email…"
                            aria-label="Find a member"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-16 pl-14 text-lg rounded-xl"
                            disabled={!isOpen}
                        />
                        {search && (
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Clear search"
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11"
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
                                            No one called “{search}” yet. If they're new, check them in as a visitor.
                                        </p>
                                        <Button className="h-11" onClick={() => setShowVisitorForm(true)} disabled={!isOpen}>
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
                                                "w-full text-left rounded-xl border bg-background p-4 flex items-center justify-between gap-3 transition-colors",
                                                r.already_checked_in
                                                    ? "opacity-60 cursor-default"
                                                    : "hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10",
                                                !isOpen && "opacity-50",
                                            )}
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <MemberAvatar name={`${r.name}${r.other_names ? ` ${r.other_names}` : ""}`} size="lg" />
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium text-base">
                                                        {r.name}
                                                        {r.other_names ? ` ${r.other_names}` : ""}
                                                    </p>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {r.phone ?? r.email ?? "No phone or email"}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                                {r.status === "visitor" && (
                                                    <Badge variant="outline">Visitor</Badge>
                                                )}
                                                {r.already_checked_in ? (
                                                    <Badge variant="secondary" className="gap-1">
                                                        <CheckCircle2 className="h-3 w-3" /> Checked in
                                                    </Badge>
                                                ) : (
                                                    <span className="text-sm text-primary flex items-center gap-1 whitespace-nowrap">
                                                        <UserCheck className="h-4 w-4" /> Check in
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                    <div className="pt-2">
                                        <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={() => setShowVisitorForm(true)} disabled={!isOpen}>
                                            <UserPlus className="mr-2 h-4 w-4" />
                                            Not listed? Check in a visitor
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Idle hint when no search */}
                    {search.trim().length < 2 && !lastCheckIn && (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                            <Search className="h-8 w-8 mb-2 text-muted-foreground/30" />
                            <p className="text-sm font-medium text-foreground">{isOpen ? "Find someone to check in" : "Check-in is closed"}</p>
                            <p className="text-sm">{isOpen ? "Type at least two letters of their name, or their phone or email." : "Open the check-in again from Attendance to use this kiosk."}</p>
                            <Button
                                variant="outline"
                                className="mt-4 h-11"
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
                        {/* The roster query returns at most the latest 30 check-ins. */}
                        {roster && roster.length >= 30 && (
                            <Badge variant="secondary">Latest 30</Badge>
                        )}
                    </div>
                    <div className="rounded-xl border bg-background flex-1 overflow-y-auto max-h-[60vh]">
                        {roster === undefined ? (
                            <div className="p-6 flex justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : roster.length === 0 ? (
                            <div className="p-8 text-center text-sm text-muted-foreground">
                                No one checked in yet. Names appear here as people arrive.
                            </div>
                        ) : (
                            <div className="divide-y">
                                {roster.map((r: RosterEntry) => (
                                    <div key={r.member_id + (r.checked_in_at ?? "")} className="p-3 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">{r.member_name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {r.checked_in_at
                                                    ? new Date(r.checked_in_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                                                    : "Time not recorded"}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            {r.is_late && (
                                                <Badge className="bg-warning/15 text-warning-strong">Late</Badge>
                                            )}
                                            {r.member_status === "visitor" && (
                                                <Badge variant="outline">Visitor</Badge>
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
                            toast.error(`Couldn't check in ${name}`, { description: errorMessage(err, "Check the connection and try again.") })
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
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center p-4 sm:items-center" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="visitor-dialog-title"
                className="bg-background rounded-xl ring-1 ring-foreground/10 shadow-xl w-full max-w-md max-h-[90dvh] overflow-y-auto p-5 sm:p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 id="visitor-dialog-title" className="text-lg font-semibold flex items-center gap-2">
                        <UserPlus className="h-5 w-5 text-muted-foreground" /> New visitor
                    </h2>
                    <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Close" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="vname">Full name</Label>
                        <Input
                            id="vname"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                            required
                            placeholder="Kwame Mensah"
                            className="h-11"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="vphone">Phone (optional, helps us recognise them next time)</Label>
                        <Input
                            id="vphone"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            type="tel"
                            placeholder="+233 24 123 4567"
                            className="h-11"
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
                            className="h-11"
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        We save visitors as members marked “Visitor”. If they join the church later, their
                        attendance comes with them.
                    </p>
                    <div className="flex gap-2 pt-2">
                        <Button type="button" variant="outline" className="h-11 flex-1" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" className="h-11 flex-1" disabled={!canSubmit}>
                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Check in visitor
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    )
}
/** What went wrong with a check-in, and what to do about it. */
function checkInProblem(status?: string): string {
    switch (status) {
        case "session_closed":
        case "outside_window":
            return "Check-in for this event is closed. Reopen it from Attendance to keep checking people in."
        case "event_not_applicable":
            return "This event is only for certain groups, and they aren't in one of them."
        case "wrong_org":
            return "They're a member of a different church."
        case "out_of_scope":
            return "They aren't in a unit you look after. Ask an admin to check them in."
        case "member_inactive":
            return "Their member record is inactive. Update it in Members, then try again."
        default:
            return "Something unexpected happened. Try again, or record them from Attendance."
    }
}

function sessionStatusLabel(status?: string | null): string {
    switch (status) {
        case "open":
            return "Open"
        case "closed":
            return "Closed"
        case "draft":
            return "Not open yet"
        case "expired":
            return "Expired"
        case "revoked":
            return "Cancelled"
        default:
            return status ? status.charAt(0).toUpperCase() + status.slice(1) : ""
    }
}


