'use client'

import { useParams } from "react-router-dom"
import { BrandProvider } from "@/components/brand-provider"
import { useQuery } from "convex/react"
import { HeartHandshake, Link2Off, Loader2 } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Id } from "../../../convex/_generated/dataModel"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { GiveForm } from "@/components/give-form"
import { EmptyState } from "@/components/ui/empty-state"

/**
 * Public giving link: no login required, same "auth handled inside the
 * page" convention as /check-in/:token. Anyone with the link can give;
 * getPublicGivingInfo deliberately exposes nothing beyond the org's name.
 */
export default function GivePage() {
    const { organizationId } = useParams<{ organizationId: string }>()
    const org = useQuery(
        api.organizations.getPublicGivingInfo,
        organizationId ? { id: organizationId as Id<"organizations"> } : "skip",
    )

    return (
        <BrandProvider brandHex={org?.brand_hex}>
        <div className="min-h-dvh flex items-start justify-center bg-muted/30 px-4 py-8 sm:items-center">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="flex items-start gap-2 text-xl font-semibold">
                        <HeartHandshake className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 break-words">{org === undefined ? "Give" : `Give to ${org?.name ?? "this church"}`}</span>
                    </CardTitle>
                    <CardDescription>
                        Thank you for giving. You'll pay securely by mobile money or card and come back here when it's done.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {org === undefined ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : !org || !org.active ? (
                        <EmptyState
                            icon={Link2Off}
                            className="py-8"
                            title="This giving link isn't working right now"
                            description="Check you have the latest link from your church, or ask someone at the church office for a new one."
                        />
                    ) : (
                        <GiveForm organizationId={organizationId as Id<"organizations">} mode="guest" />
                    )}
                </CardContent>
            </Card>
        </div>
        </BrandProvider>
    )
}
