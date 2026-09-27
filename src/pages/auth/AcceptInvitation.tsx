
import { useEffect, useRef, useState } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { useUser } from "@clerk/clerk-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, Loader2, ShieldAlert, Mail, Clock, UserRound, UserCheck } from "lucide-react"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { UserSync } from "@/components/user-sync"
import { useAnalytics } from "@/hooks/useAnalytics"
import { AnalyticsEventType } from "@/services/analytics/types"
import { errorMessage } from "@/lib/errors"
import { formatDayTime } from '@/lib/display'

export default function AcceptInvitationPage() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { user: clerkUser, isLoaded } = useUser()

    const token = searchParams.get('token') || ""

    // Convex Queries
    const invitation = useQuery(api.invitations.getByToken, { token })
    const currentUser = useQuery(api.users.current)
    const acceptInvitationMutation = useMutation(api.invitations.accept)
    const { trackEvent } = useAnalytics()
    // Only the church's name, so the page can say who sent the invitation.
    const church = useQuery(
        api.organizations.getPublicGivingInfo,
        invitation?.organization_id ? { id: invitation.organization_id } : "skip",
    )
    const churchName = church?.name

    const [isAccepting, setIsAccepting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const redirectTimeoutRef = useRef<number | null>(null)

    useEffect(() => {
        if (!token) {
            setError("This invitation link is missing part of its address. Open the link from your invitation email again.")
            return
        }
        try {
            localStorage.setItem("pending_invitation_token", token)
        } catch {
            // ignore storage errors
        }
    }, [token])

    // Handle invitation status errors (like expired or used)
    useEffect(() => {
        if (invitation === null && token) {
            setError("This invitation has expired or has already been used. Ask the person who invited you to send a new one.")
        }
    }, [invitation, token])

    // An invitation may be claimed by a brand-new / org-less account regardless
    // of email (supports placeholder member emails), but must not be accepted by
    // an already-established account (one that belongs to an org) whose email
    // doesn't match: that mirrors the server-side guard in invitations.accept.
    const invitedEmail = invitation?.email?.trim().toLowerCase()
    const myEmail = clerkUser?.primaryEmailAddress?.emailAddress?.trim().toLowerCase()
    const emailMismatch = Boolean(invitation && myEmail && invitedEmail && myEmail !== invitedEmail)
    const isEstablishedAccount = Boolean(currentUser?.organization_id)
    const blockAccept = emailMismatch && isEstablishedAccount

    const handleAccept = async () => {
        if (!clerkUser || !invitation || blockAccept) return

        setIsAccepting(true)
        setError(null)
        try {
            await acceptInvitationMutation({ token })
            setSuccess(true)
            try {
                localStorage.removeItem("pending_invitation_token")
            } catch {
                // ignore
            }

            trackEvent(AnalyticsEventType.INVITATION_ACCEPTED, {
                role: invitation.intended_role,
                has_member_link: !!invitation.member_id,
            });

            // Redirect to appropriate dashboard after 3 seconds
            // Use window.location.href for a full page reload to ensure all queries refresh
            const redirectPath = invitation.intended_role === 'organization_admin' || invitation.intended_role === 'admin' ? '/admin' : '/dashboard'
            redirectTimeoutRef.current = window.setTimeout(() => {
                window.location.href = redirectPath
            }, 3000)
        } catch (err: any) {
            console.error('Error accepting invitation:', err)
            setError(acceptProblem(err))
        } finally {
            setIsAccepting(false)
        }
    }

    useEffect(() => {
        return () => {
            if (redirectTimeoutRef.current) {
                window.clearTimeout(redirectTimeoutRef.current)
            }
        }
    }, [])

    const churchLabel = churchName ?? "your church"

    if (token === "" || (invitation === undefined && !error)) {
        return (
            <Page>
                <div className="flex flex-col items-center gap-4" role="status">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Opening your invitation…</span>
                </div>
            </Page>
        )
    }


    if (error) {
        return (
            <Page>
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                            <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" />
                            We couldn't open this invitation
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p role="alert" className="text-sm text-muted-foreground">{error}</p>
                        <Button
                            onClick={() => navigate('/')}
                            variant="outline"
                            className="h-11 w-full"
                        >
                            Go to the home page
                        </Button>
                    </CardContent>
                </Card>
            </Page>
        )
    }

    if (success) {
        return (
            <Page>
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                            <CheckCircle className="h-5 w-5 shrink-0 text-success" />
                            Welcome to {churchLabel}
                        </CardTitle>
                        <CardDescription>
                            You've joined as {roleWithArticle(invitation?.intended_role)}.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Taking you in…
                        </div>
                    </CardContent>
                </Card>
            </Page>
        )
    }

    if (!isLoaded) {
        return (
            <Page>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </Page>
        )
    }

    if (!clerkUser) {
        return (
            <Page>
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                            <Mail className="h-5 w-5 shrink-0 text-muted-foreground" />
                            {churchName ? `${churchName} has invited you` : "You've been invited"}
                        </CardTitle>
                        <CardDescription>
                            Sign in, or create an account, to accept the invitation.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            New to Floc? Create an account with{" "}
                            {invitation?.email ? <span className="font-medium text-foreground break-all">{invitation.email}</span> : "your email"}.
                            It only takes a minute.
                        </p>
                        <div className="space-y-3">
                            <Button
                                onClick={() => navigate(`/sign-up?force_redirect_url=${encodeURIComponent(window.location.href)}`)}
                                className="h-11 w-full"
                            >
                                Create an account
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => navigate(`/sign-in?force_redirect_url=${encodeURIComponent(window.location.href)}`)}
                                className="h-11 w-full"
                            >
                                I already have an account
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </Page>
        )
    }

    return (
        <>
            <UserSync />
            <Page>
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                            <Mail className="h-5 w-5 shrink-0 text-muted-foreground" />
                            {churchName ? `${churchName} has invited you` : "You've been invited"}
                        </CardTitle>
                        <CardDescription>
                            Accept to join {churchLabel} on Floc.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <dl className="space-y-3 text-sm">
                            <Detail icon={<UserRound className="h-4 w-4" />} label="Your role">
                                {roleLabel(invitation?.intended_role)}
                            </Detail>

                            {invitation?.member_id && (
                                <Detail icon={<UserCheck className="h-4 w-4" />} label="Member record">
                                    Linked to your member record at {churchLabel}
                                </Detail>
                            )}

                            {invitation?.expires_at && (
                                <Detail icon={<Clock className="h-4 w-4" />} label="Accept by">
                                    {formatDayTime(new Date(invitation.expires_at))}
                                </Detail>
                            )}
                        </dl>

                        {blockAccept && (
                            <div role="alert" className="space-y-1 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                                <div className="flex items-center gap-2 text-destructive-strong">
                                    <ShieldAlert className="h-4 w-4 shrink-0" />
                                    <span className="text-sm font-medium">This invitation is for a different email</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    It was sent to <span className="font-medium text-foreground break-all">{invitation?.email}</span>, but you're
                                    signed in as <span className="font-medium text-foreground break-all">{clerkUser?.primaryEmailAddress?.emailAddress}</span>.
                                    Sign out, then sign in with the invited email to accept it.
                                </p>
                            </div>
                        )}

                        <div className="space-y-3">
                            <Button
                                onClick={handleAccept}
                                disabled={isAccepting || blockAccept}
                                className="h-11 w-full text-base"
                            >
                                {isAccepting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Accepting…
                                    </>
                                ) : (
                                    'Accept invitation'
                                )}
                            </Button>
                            <p className="text-center text-xs text-muted-foreground">
                                You'll join {churchLabel} as {roleWithArticle(invitation?.intended_role)}.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </Page>
        </>
    )
}

function Page({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-dvh bg-background flex items-center justify-center px-4 py-8">
            {children}
        </div>
    )
}

function Detail({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-3">
            <div className="mt-0.5 text-muted-foreground">{icon}</div>
            <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-medium">{children}</dd>
            </div>
        </div>
    )
}

/** "organization_admin" → "Organization admin". */
function roleLabel(role?: string | null): string {
    if (!role) return "Member"
    const words = role.replace(/_/g, " ").trim()
    return words.charAt(0).toUpperCase() + words.slice(1)
}

/** "an organization admin", "a treasurer". */
function roleWithArticle(role?: string | null): string {
    const label = roleLabel(role).toLowerCase()
    return `${/^[aeiou]/.test(label) ? "an" : "a"} ${label}`
}

/** The server's reason, said plainly with what to do next. */
function acceptProblem(err: unknown): string {
    const raw = errorMessage(err, "")
    if (/expired/i.test(raw)) return "This invitation has expired. Ask the person who invited you to send a new one."
    if (/already used|revoked/i.test(raw)) return "This invitation has already been used or was withdrawn. Ask the person who invited you to send a new one."
    if (/invalid token/i.test(raw)) return "We couldn't find this invitation. Check you opened the latest link from your email."
    if (/logged in/i.test(raw)) return "You've been signed out. Sign in again, then open the invitation link."
    return "We couldn't accept the invitation just now. Check your connection and try again."
}
