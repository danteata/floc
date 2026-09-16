'use client'

import { useParams } from "react-router-dom"
import { BrandProvider } from "@/components/brand-provider"
import { useQuery } from "convex/react"
import { HeartHandshake, Loader2 } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Id } from "../../../convex/_generated/dataModel"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { GiveForm } from "@/components/give-form"

/**
 * Public giving link — no login required, same "auth handled inside the
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
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
            <Card className="max-w-md w-full border-border/50 shadow-soft">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <HeartHandshake className="h-5 w-5 text-primary" />
                        {org === undefined ? "Give" : `Give to ${org?.name ?? "this organization"}`}
                    </CardTitle>
                    <CardDescription>
                        Secure checkout via Paystack. You'll be redirected back once your gift is confirmed.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {org === undefined ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : !org || !org.active ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            This giving link isn't available right now.
                        </p>
                    ) : (
                        <GiveForm organizationId={organizationId as Id<"organizations">} mode="guest" />
                    )}
                </CardContent>
            </Card>
        </div>
        </BrandProvider>
    )
}
