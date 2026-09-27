'use client'

import { useState, useEffect } from "react"
import { BrandProvider } from "@/components/brand-provider"
import { useParams, Link } from "react-router-dom"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { SignIn } from "@clerk/clerk-react"
import { CheckCircle2, Clock, AlertCircle, Loader2, QrCode, UserX, ShieldOff, CalendarOff, MapPinOff, UserCheck } from "lucide-react"
import type { FunctionReturnType } from "convex/server"
import { api } from "../../../convex/_generated/api"
import { Id } from "../../../convex/_generated/dataModel"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/errors"
import { titleCase } from '@/lib/display'

type CheckInResult =
    | { status: "loading" }
    | { status: "invalid_token" }
    | { status: "needs_auth" }
    | { status: "checking_in" }
    | {
          status: "checked_in"
          member_id?: Id<"members">
          member_name: string
          session_display_name: string
          is_late: boolean
          minutes_late: number
          attendance_id?: Id<"attendance">
      }
    | {
          status: "already_checked_in"
          member_id?: Id<"members">
          member_name: string
          session_display_name: string
          attendance_id?: Id<"attendance">
      }
    | { status: "session_closed" }
    | { status: "outside_window" }
    | { status: "member_not_linked" }
    | { status: "wrong_org" }
    | { status: "event_not_applicable" }
    | { status: "member_inactive" }
    | { status: "outside_geofence" }
    | { status: "error"; message: string }

/**
 * The brand rides on `getSessionByToken`, which this page already calls, so a
 * check-in screen at the door carries the church's colour without a second
 * request and without a public theme endpoint keyed by organization.
 */
export default function CheckInPage() {
    const { token } = useParams<{ token: string }>()
    const sessionInfo = useQuery(api.check_ins.getSessionByToken, token ? { token } : "skip")

    return (
        <BrandProvider brandHex={sessionInfo?.brand_hex}>
            <CheckInFlow />
        </BrandProvider>
    )
}

function CheckInFlow() {
    const { token } = useParams<{ token: string }>()
    const { isAuthenticated, isLoading } = useConvexAuth()
    const [result, setResult] = useState<CheckInResult>({ status: "loading" })
    const [attempted, setAttempted] = useState(false)

    const sessionInfo = useQuery(
        api.check_ins.getSessionByToken,
        token ? { token } : "skip",
    )
    const checkIn = useMutation(api.check_ins.checkInWithToken)
    const checkInHouseholdMember = useMutation(api.check_ins.checkInHouseholdMemberWithToken)

    // Run the check-in once authenticated and session is valid.
    useEffect(() => {
        if (!token || isLoading || attempted) return
        if (sessionInfo === undefined) return // still loading session info
        if (sessionInfo === null) return // invalid token handled by render guard
        if (!isAuthenticated) return // needs auth handled by render guard
        // Authenticated + valid session -> attempt check-in.
        setAttempted(true)
        setResult({ status: "checking_in" })
        checkIn({ token, method: "qr" })
            .then((res: any) => {
                switch (res.status) {
                    case "checked_in":
                        setResult({
                            status: "checked_in",
                            member_id: res.member_id,
                            member_name: res.member_name,
                            session_display_name: res.session_display_name ?? sessionInfo.display_name,
                            is_late: res.is_late,
                            minutes_late: res.minutes_late,
                            attendance_id: res.attendance_id,
                        })
                        break
                    case "already_checked_in":
                        setResult({
                            status: "already_checked_in",
                            member_id: res.member_id,
                            member_name: res.member_name,
                            session_display_name: res.session_display_name ?? sessionInfo.display_name,
                            attendance_id: res.attendance_id,
                        })
                        break
                    case "session_closed":
                    case "outside_window":
                        setResult({ status: "session_closed" })
                        break
                    case "member_not_linked":
                        setResult({ status: "member_not_linked" })
                        break
                    case "wrong_org":
                        setResult({ status: "wrong_org" })
                        break
                    case "event_not_applicable":
                        setResult({ status: "event_not_applicable" })
                        break
                    case "member_inactive":
                        setResult({ status: "member_inactive" })
                        break
                    case "outside_geofence":
                        setResult({ status: "outside_geofence" })
                        break
                    case "invalid_token":
                        setResult({ status: "invalid_token" })
                        break
                    default:
                        setResult({ status: "error", message: "Something unexpected happened. Scan the QR code again, or ask someone on the welcome team to check you in." })
                }
            })
            .catch((err: any) => {
                setResult({ status: "error", message: errorMessage(err, "Check your connection and scan the QR code again, or ask someone on the welcome team to check you in.") })
            })
    }, [token, isLoading, sessionInfo, isAuthenticated, attempted, checkIn])

    // Invalid token: no Clerk sign-in needed, just show the error.
    if (result.status === "invalid_token" || sessionInfo === null) {
        return (
            <Shell>
                <ResultCard
                    icon={<AlertCircle className="h-10 w-10 text-muted-foreground" />}
                    title="This QR code has expired"
                    description="Scan the code on display today, or ask someone on the welcome team to check you in."
                />
            </Shell>
        )
    }

    if (isLoading || sessionInfo === undefined || result.status === "loading") {
        return (
            <Shell>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin mb-3" />
                    <p className="text-sm">Loading check-in…</p>
                </div>
            </Shell>
        )
    }

    // Needs auth: show Clerk sign-in with redirect back here.
    if (result.status === "needs_auth" || !isAuthenticated) {
        return (
            <Shell>
                <div className="mx-auto max-w-md w-full">
                    <div className="text-center mb-6">
                        <QrCode className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <h1 className="text-xl font-semibold">Sign in to check in</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {[titleCase(sessionInfo?.display_name), sessionInfo?.organization_name].filter(Boolean).join(" · ")}
                        </p>
                    </div>
                    <SignIn routing="hash" afterSignInUrl={window.location.href} />
                </div>
            </Shell>
        )
    }

    if (result.status === "checking_in") {
        return (
            <Shell>
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin mb-3" />
                    <p className="text-sm">Checking you in to {titleCase(sessionInfo?.display_name)}…</p>
                </div>
            </Shell>
        )
    }

    if (result.status === "checked_in") {
        return (
            <Shell>
                <ResultCard
                    icon={<CheckCircle2 className="h-12 w-12 text-success" />}
                    title={`You're checked in, ${result.member_name}`}
                    description={`Welcome to ${titleCase(result.session_display_name)}.`}
                >
                    {result.is_late && (
                        <p className="text-sm text-warning-strong flex items-center justify-center gap-1 mt-3">
                            <Clock className="h-4 w-4" />
                            Checked in {result.minutes_late} {result.minutes_late === 1 ? "minute" : "minutes"} after the start
                        </p>
                    )}
                    {token && result.member_id && result.attendance_id && (
                        <HouseholdSuggestions
                            token={token}
                            memberId={result.member_id}
                            attendanceId={result.attendance_id}
                            checkInHouseholdMember={checkInHouseholdMember}
                        />
                    )}
                    <div className="mt-6 flex gap-2">
                        <Button asChild variant="outline" className="h-11 flex-1">
                            <Link to="/portal/attendance">See my attendance</Link>
                        </Button>
                    </div>
                </ResultCard>
            </Shell>
        )
    }

    if (result.status === "already_checked_in") {
        return (
            <Shell>
                <ResultCard
                    icon={<CheckCircle2 className="h-12 w-12 text-success" />}
                    title={`You're already checked in, ${result.member_name}`}
                    description={`We have you down for ${titleCase(result.session_display_name)}. There's nothing more to do.`}
                    tone="muted"
                >
                    {token && result.member_id && result.attendance_id && (
                        <HouseholdSuggestions
                            token={token}
                            memberId={result.member_id}
                            attendanceId={result.attendance_id}
                            checkInHouseholdMember={checkInHouseholdMember}
                        />
                    )}
                    <div className="mt-6 flex gap-2">
                        <Button asChild variant="outline" className="h-11 flex-1">
                            <Link to="/portal/attendance">See my attendance</Link>
                        </Button>
                    </div>
                </ResultCard>
            </Shell>
        )
    }

    if (result.status === "member_not_linked") {
        return (
            <Shell>
                <ResultCard
                    icon={<UserX className="h-10 w-10 text-muted-foreground" />}
                    title="We couldn't find your member record"
                        description="Your account isn't linked to your church's member record yet. Link it once, then scan the QR code again."
                >
                    <Button asChild className="mt-4 h-11 w-full">
                        <Link to={`/portal/link?token=${token}`}>Link my account</Link>
                    </Button>
                </ResultCard>
            </Shell>
        )
    }

    const errorStates: Partial<Record<CheckInResult["status"], { icon: React.ReactNode; title: string; description: string }>> = {
        session_closed: { icon: <CalendarOff className="h-10 w-10 text-muted-foreground" />, title: "Check-in is closed", description: "Check-in for this event has finished. If you're here, ask someone on the welcome team to check you in." },
        outside_window: { icon: <CalendarOff className="h-10 w-10 text-muted-foreground" />, title: "Check-in isn't open", description: "Check-in isn't open at the moment. Try again closer to the start, or ask someone on the welcome team." },
        wrong_org: { icon: <ShieldOff className="h-10 w-10 text-muted-foreground" />, title: "This QR code is for another church", description: "Your member record is with a different church. Ask someone on the welcome team to check you in." },
        event_not_applicable: { icon: <UserX className="h-10 w-10 text-muted-foreground" />, title: "This event is for another group", description: "This event is only for certain groups in the church. If you think you should be on it, ask your group leader." },
        member_inactive: { icon: <UserX className="h-10 w-10 text-muted-foreground" />, title: "Your membership isn't active", description: "Your member record is marked inactive. Ask someone at the church office to update it." },
        outside_geofence: { icon: <MapPinOff className="h-10 w-10 text-muted-foreground" />, title: "You seem to be away from church", description: "Check-in works at the venue. If you're here, ask someone on the welcome team to check you in." },
        error: { icon: <AlertCircle className="h-10 w-10 text-destructive" />, title: "We couldn't check you in", description: (result as any).message ?? "Scan the QR code again, or ask someone on the welcome team to check you in." },
    }

    const err = result.status in errorStates ? errorStates[result.status as keyof typeof errorStates] : null
    if (err) {
        return (
            <Shell>
                <ResultCard icon={err.icon} title={err.title} description={err.description} />
            </Shell>
        )
    }

    return null
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-dvh flex items-center justify-center bg-muted/30 px-4 py-8">
            <div className="w-full max-w-md">{children}</div>
        </div>
    )
}

function ResultCard({
    icon,
    title,
    description,
    children,
    tone = "default",
}: {
    icon: React.ReactNode
    title: string
    description: string
    children?: React.ReactNode
    tone?: "default" | "muted"
}) {
    return (
        <Card data-tone={tone}>
            <CardHeader>
                <CardTitle className="flex flex-col items-center text-center gap-3">
                    {icon}
                    <span className="text-lg font-semibold">{title}</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="text-center text-sm text-muted-foreground">
                <p>{description}</p>
                {children}
            </CardContent>
        </Card>
    )
}

/**
 * "Check in your household too" suggestions for other members of the checked-in member's
 * household: lets a parent check in their kids (or a spouse) in one tap
 * without each needing their own device/QR scan.
 */
function HouseholdSuggestions({
    token,
    memberId,
    attendanceId,
    checkInHouseholdMember,
}: {
    token: string
    memberId: Id<"members">
    attendanceId: Id<"attendance">
    checkInHouseholdMember: (args: {
        token: string
        member_id: Id<"members">
    }) => Promise<FunctionReturnType<typeof api.check_ins.checkInHouseholdMemberWithToken>>
}) {
    const suggestions = useQuery(api.households.getUncheckedHouseholdMembers, {
        member_id: memberId,
        attendance_id: attendanceId,
    })
    const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set())
    const [pending, setPending] = useState<string | null>(null)

    if (!suggestions || suggestions.length === 0) return null

    return (
        <div className="mt-4 rounded-lg border border-dashed p-3 text-left">
            <p className="text-sm font-medium text-foreground mb-2">Check in your household too</p>
            <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => {
                    const isChecked = checkedIn.has(s.id)
                    return (
                        <Button
                            key={s.id}
                            variant={isChecked ? "secondary" : "outline"}
                            className="h-11"
                            disabled={isChecked || pending === s.id}
                            onClick={async () => {
                                setPending(s.id)
                                try {
                                    await checkInHouseholdMember({ token, member_id: s.id })
                                    setCheckedIn((prev) => new Set(prev).add(s.id))
                                } finally {
                                    setPending(null)
                                }
                            }}
                        >
                            {isChecked ? (
                                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            ) : (
                                <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {s.name}
                        </Button>
                    )
                })}
            </div>
        </div>
    )
}
