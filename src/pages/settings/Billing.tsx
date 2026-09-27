import { useState } from "react"
import { CreditCard, Check, Loader2, Sparkles, Crown, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LayoutWrapper } from "@/components/layout-wrapper"
import { PageHeader } from "@/components/ui/page-header"
import { useSubscription } from "@/providers/SubscriptionProvider"
import { useUserRole } from "@/hooks/use-user-role"
import { toast } from "sonner"

const PRO_FEATURES = [
    "Unlimited members & units",
    "Advanced reports & CSV exports",
    "Priority support",
    "Early access to new features",
]

function formatDate(iso: string | null): string {
    if (!iso) return "Not set"
    return new Date(iso).toLocaleDateString("en-GB", {
        year: "numeric",
        month: "long",
        day: "numeric",
    })
}

/** Paystack's subscription states, as a church treasurer would say them. */
const STATUS_LABEL: Record<string, string> = {
    active: "Active",
    "non-renewing": "Won't renew",
    attention: "Needs attention",
    past_due: "Payment overdue",
    cancelled: "Cancelled",
    none: "No subscription",
}

export default function BillingPage() {
    const { isPro, status, currentPeriodEnd, loading, startCheckout, manageSubscription } =
        useSubscription()
    const { isAdmin, isLoading: roleLoading } = useUserRole()
    const [actionLoading, setActionLoading] = useState(false)

    if (!roleLoading && !isAdmin) {
        return (
            <LayoutWrapper>
                <div className="max-w-4xl mx-auto">
                    <Card className="border-border/50 shadow-soft">
                        <CardContent className="pt-6">
                            <div className="text-center">
                                <div className="p-3 bg-muted rounded-full inline-block mb-4">
                                    <ShieldAlert className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <h3 className="text-lg font-semibold mb-2">Admins only</h3>
                                <p className="text-muted-foreground">
                                    Billing affects your whole organization's plan, so only organization
                                    admins can view or change it.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </LayoutWrapper>
        )
    }

    const handleUpgrade = async () => {
        setActionLoading(true)
        try {
            await startCheckout(`${window.location.origin}/billing`)
            // The user is redirected to Paystack; the webhook updates the row.
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not start checkout.")
        } finally {
            setActionLoading(false)
        }
    }

    const handleManage = async () => {
        setActionLoading(true)
        try {
            await manageSubscription()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not open subscription manager.")
        } finally {
            setActionLoading(false)
        }
    }

    return (
        <LayoutWrapper>
            <div className="max-w-4xl mx-auto space-y-6">
                <PageHeader title="Billing" description="Your church's plan and payments." />

                {/* Current plan */}
                <Card className="border-border/50 shadow-soft">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {isPro ? (
                                    <Crown className="h-5 w-5 text-warning-strong" />
                                ) : (
                                    <Sparkles className="h-5 w-5 text-muted-foreground" />
                                )}
                                <CardTitle>Current plan</CardTitle>
                            </div>
                            <Badge
                                variant={isPro ? "default" : "secondary"}
                                className={isPro ? "bg-primary/20 text-primary border-primary/30" : ""}
                            >
                                {loading ? "…" : isPro ? "Pro" : "Free"}
                            </Badge>
                        </div>
                        <CardDescription>
                            {isPro
                                ? "Your church has every Floc feature."
                                : "Your church is on the Free plan."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {loading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading subscription…
                            </div>
                        ) : (
                            <>
                                {(status === 'past_due' || status === 'attention') && (
                                    <div role="alert" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
                                        <p className="font-medium">Your last payment didn't go through.</p>
                                        <p className="text-muted-foreground">Update your card under Manage subscription to keep Pro features.</p>
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                                    <div>
                                        <p className="text-muted-foreground">Status</p>
                                        <p className="font-medium">{STATUS_LABEL[status] ?? status}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">{status === 'non-renewing' || status === 'cancelled' ? 'Ends' : 'Renews'}</p>
                                        <p className="font-medium">{formatDate(currentPeriodEnd)}</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-3">
                                    {isPro ? (
                                        <Button
                                            variant="outline"
                                            onClick={handleManage}
                                            disabled={actionLoading}
                                        >
                                            <CreditCard className="mr-2 h-4 w-4" />
                                            Manage subscription
                                        </Button>
                                    ) : (
                                        <Button onClick={handleUpgrade} disabled={actionLoading}>
                                            {actionLoading ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <Crown className="mr-2 h-4 w-4" />
                                            )}
                                            Upgrade to Pro
                                        </Button>
                                    )}
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Plan comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-border/50">
                        <CardHeader>
                            <CardTitle className="text-base">Free</CardTitle>
                            <CardDescription>Core church management.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold">
                                GH₵0<span className="text-sm font-normal text-muted-foreground">/mo</span>
                            </p>
                            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                                <li className="flex gap-2">
                                    <Check className="h-4 w-4 text-primary mt-0.5" /> Members & units
                                </li>
                                <li className="flex gap-2">
                                    <Check className="h-4 w-4 text-primary mt-0.5" /> Attendance tracking
                                </li>
                                <li className="flex gap-2">
                                    <Check className="h-4 w-4 text-primary mt-0.5" /> Basic financials
                                </li>
                            </ul>
                        </CardContent>
                    </Card>

                    <Card
                        className={
                            isPro
                                ? "border-primary/40 bg-primary/5"
                                : "border-primary/30 shadow-soft"
                        }
                    >
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">Pro</CardTitle>
                                {isPro && <Badge className="bg-primary/20 text-primary">Active</Badge>}
                            </div>
                            <CardDescription>Everything in Free, plus more.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-semibold">
                                GH₵150<span className="text-sm font-normal text-muted-foreground">/mo</span>
                            </p>
                            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                                {PRO_FEATURES.map((f) => (
                                    <li key={f} className="flex gap-2">
                                        <Check className="h-4 w-4 text-primary mt-0.5" /> {f}
                                    </li>
                                ))}
                            </ul>
                            {!isPro && !loading && (
                                <Button className="mt-4 w-full" onClick={handleUpgrade} disabled={actionLoading}>
                                    {actionLoading && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    Upgrade to Pro
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <p className="text-xs text-muted-foreground">
                    Payments are handled by Paystack. You'll finish paying on their page, and your plan
                    changes here as soon as the payment goes through.
                </p>
            </div>
        </LayoutWrapper>
    )
}
