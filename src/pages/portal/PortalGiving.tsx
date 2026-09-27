'use client'

import { useState } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "convex/react"
import { HeartHandshake, Loader2, UserRoundX } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { GiveForm } from "@/components/give-form"
import { TRANSACTION_CATEGORIES } from "@/lib/financial-utils"
import { formatMoney } from "@/lib/money"
import { formatDay } from "./format"

export default function PortalGiving() {
    const [giving, setGiving] = useState(false)
    const profile = useQuery(api.check_ins.getMyProfile, {})
    const history = useQuery(api.financial.getMyGiving, {})

    const loading = profile === undefined || history === undefined

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                        <HeartHandshake className="h-4 w-4 text-muted-foreground" />
                        My giving
                    </CardTitle>
                    {profile?.organization_id && (
                        <Button size="sm" onClick={() => setGiving(true)}>
                            Give now
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-2">
                            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                        </div>
                    ) : !profile ? (
                        <EmptyState
                            icon={UserRoundX}
                            title="Your account isn't linked to a member yet"
                            description="Link your account to your church's member record to see your giving."
                            action={
                                <Button asChild size="sm">
                                    <Link to="/portal/link">Link my account</Link>
                                </Button>
                            }
                        />
                    ) : history.length === 0 ? (
                        <EmptyState
                            icon={HeartHandshake}
                            title="No gifts yet"
                            description="Gifts you make, online or at church, will show here."
                            action={
                                profile.organization_id ? (
                                    <Button size="sm" variant="outline" onClick={() => setGiving(true)}>
                                        Give now
                                    </Button>
                                ) : undefined
                            }
                        />
                    ) : (
                        <div className="divide-y divide-border/40">
                            {history.map((h) => (
                                <div key={h._id} className="flex items-center justify-between gap-3 py-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium tabular-nums">{formatMoney(h.amount, "GHS")}</p>
                                        <p className="text-xs text-muted-foreground">{formatDay(h.date)}</p>
                                    </div>
                                    <Badge variant="outline">
                                        {TRANSACTION_CATEGORIES[h.category as keyof typeof TRANSACTION_CATEGORIES]?.label ?? titleCaseFirst(h.category)}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={giving} onOpenChange={setGiving}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Give</DialogTitle>
                        <DialogDescription>Choose an amount and what it's for. You'll finish paying on the next screen.</DialogDescription>
                    </DialogHeader>
                    {profile?.organization_id ? (
                        <GiveForm
                            organizationId={profile.organization_id}
                            mode="member"
                            defaultName={profile.name}
                            defaultEmail={profile.email}
                            onStarted={() => setGiving(false)}
                        />
                    ) : (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}

function titleCaseFirst(value?: string | null): string {
    if (!value) return ""
    const spaced = value.replace(/_/g, " ")
    return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
