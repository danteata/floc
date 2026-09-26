
import { useEffect, useRef, useState } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { useUser } from "@clerk/clerk-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, AlertCircle, Loader2, UserCheck, ShieldAlert, Key, Mail, Clock, User } from "lucide-react"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { UserSync } from "@/components/user-sync"
import { useAnalytics } from "@/hooks/useAnalytics"
import { AnalyticsEventType } from "@/services/analytics/types"

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

    const [isAccepting, setIsAccepting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const redirectTimeoutRef = useRef<number | null>(null)

    useEffect(() => {
        if (!token) {
            setError('No invitation token provided')
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
            setError('Invalid or expired invitation')
        }
    }, [invitation, token])

    // An invitation may be claimed by a brand-new / org-less account regardless
    // of email (supports placeholder member emails), but must not be accepted by
    // an already-established account (one that belongs to an org) whose email
    // doesn't match — that mirrors the server-side guard in invitations.accept.
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
            setError(err.message || 'Failed to accept invitation')
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

    if (token === "" || (invitation === undefined && !error)) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-6">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <span className="text-muted-foreground">Loading invitation...</span>
                </div>
            </div>
        )
    }


    if (error) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-6">
                <Card className="w-full max-w-md">
                    <CardHeader className="bg-destructive/10">
                        <CardTitle className="flex items-center gap-3 text-destructive">
                            <ShieldAlert className="h-6 w-6" />
                            Invitation Error
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                            <p className="text-destructive">{error}</p>
                        </div>
                        <Button
                            onClick={() => navigate('/')}
                            className="w-full"
                        >
                            Return Home
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (success) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-6">
                <Card className="w-full max-w-md">
                    <CardHeader className="bg-primary/10">
                        <CardTitle className="flex items-center gap-3 text-primary">
                            <CheckCircle className="h-6 w-6" />
                            Welcome Aboard!
                        </CardTitle>
                        <CardDescription>
                            Your invitation has been accepted successfully.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <p className="text-muted-foreground">
                            You now have access to the organization. Redirecting to your dashboard...
                        </p>
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                                {invitation?.intended_role?.replace('_', ' ')}
                            </Badge>
                            <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                        </div>
                        <div className="pt-4 flex justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (!isLoaded) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-6">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        )
    }

    if (!clerkUser) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-6">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Sign In Required
                        </CardTitle>
                        <CardDescription>
                            Please sign in or create an account to accept this invitation
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                        <p className="text-sm text-muted-foreground">
                            You need to be signed in to accept this invitation and join the organization.
                        </p>
                        <div className="space-y-3">
                            <Button
                                onClick={() => navigate(`/sign-up?force_redirect_url=${encodeURIComponent(window.location.href)}`)}
                                className="w-full"
                            >
                                Create Account
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => navigate(`/sign-in?force_redirect_url=${encodeURIComponent(window.location.href)}`)}
                                className="w-full"
                            >
                                Sign In
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <>
            <UserSync />
            <div className="min-h-screen bg-background flex items-center justify-center p-6">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Mail className="h-5 w-5 text-primary" />
                            You're Invited!
                        </CardTitle>
                        <CardDescription>
                            You have been invited to join the organization
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    Your Role
                                </p>
                                <div className="p-3 rounded-lg border bg-muted/50 flex items-center justify-between">
                                    <span className="font-medium capitalize">
                                        {invitation?.intended_role?.replace('_', ' ')}
                                    </span>
                                    <Badge variant="secondary">Active</Badge>
                                </div>
                            </div>

                            {invitation?.member_id && (
                                <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground">
                                        Linked Profile
                                    </p>
                                    <div className="p-3 rounded-lg border bg-muted/50">
                                        <p className="text-sm">Member Profile Connected</p>
                                        <p className="text-xs text-muted-foreground">Your profile is linked to this invitation</p>
                                    </div>
                                </div>
                            )}

                            <div className="p-3 bg-muted/30 rounded-lg border">
                                <div className="flex items-center gap-2 mb-1">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">Expires</span>
                                </div>
                                <p className="text-sm">
                                    {new Date(invitation?.expires_at || 0).toLocaleDateString()} at {new Date(invitation?.expires_at || 0).toLocaleTimeString()}
                                </p>
                            </div>
                        </div>

                        {blockAccept && (
                            <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 space-y-1">
                                <div className="flex items-center gap-2 text-destructive">
                                    <ShieldAlert className="h-4 w-4" />
                                    <span className="text-sm font-medium">This invitation isn't for this account</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    It was issued to <span className="font-medium">{invitation?.email}</span>, but you're
                                    signed in as <span className="font-medium">{clerkUser?.primaryEmailAddress?.emailAddress}</span>.
                                    Sign in with the invited email to accept it.
                                </p>
                            </div>
                        )}

                        <div className="pt-2">
                            <Button
                                onClick={handleAccept}
                                disabled={isAccepting || blockAccept}
                                className="w-full"
                                size="lg"
                            >
                                {isAccepting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Accepting...
                                    </>
                                ) : (
                                    'Accept Invitation'
                                )}
                            </Button>
                        </div>

                        <p className="text-xs text-muted-foreground text-center">
                            By accepting this invitation, you will join the organization with the role specified above.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </>
    )
}
