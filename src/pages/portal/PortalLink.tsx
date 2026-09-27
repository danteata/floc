'use client'

import { useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { Link as LinkIcon, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { errorMessage } from "@/lib/errors"

export default function PortalLink() {
    const status = useQuery(api.check_ins.getMyLinkStatus, {})
    const linkAccount = useMutation(api.check_ins.linkMyAccount)
    const [linking, setLinking] = useState(false)

    const handleLink = async () => {
        setLinking(true)
        try {
            const res: any = await linkAccount({})
            if (res.status === "linked") {
                toast.success(`Account linked to ${res.member_name}`)
            } else if (res.status === "already_linked") {
                toast.info(`Your account is already linked to ${res.member_name}`)
            } else if (res.status === "no_matching_member") {
                toast.error("Couldn't link your account", { description: "No member record matches your email. Ask your church office to add you as a member with this email." })
            } else if (res.status === "wrong_org") {
                toast.error("Couldn't link your account", { description: "That member record is with a different church. Ask your church office to check your details." })
            }
        } catch (err: any) {
            toast.error("Couldn't link your account", { description: errorMessage(err, "Check your connection and try again.") })
        } finally {
            setLinking(false)
        }
    }

    if (status === undefined) {
        return (
            <Card>
                <CardContent className="p-8 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        )
    }

    if (!status.authenticated) {
        return (
            <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    Sign in to link your account to your member record.
                </CardContent>
            </Card>
        )
    }

    if ((status as any).linked) {
        const s = status as any
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        Account linked
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm">
                        You're linked to <span className="font-medium">{s.member_name}</span> at{" "}
                        <span className="font-medium">{s.organization_name}</span>.
                    </p>
                    <Button asChild variant="outline">
                        <a href="/portal">Go to my portal</a>
                    </Button>
                </CardContent>
            </Card>
        )
    }

    const s = status as any
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <LinkIcon className="h-4 w-4 text-muted-foreground" />
                    Link your member account
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="link-email">Your email</Label>
                    <Input id="link-email" value={s.email ?? ""} disabled />
                    <p className="text-xs text-muted-foreground">
                        We'll look for your church's member record with this email.
                    </p>
                </div>
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm flex gap-2">
                    <AlertCircle className="h-4 w-4 text-warning-strong shrink-0 mt-0.5" />
                    <div>
                        <p className="font-medium">If we can't find you</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Your church may not have added you yet, or has a different email for you. Ask your church office to add you with this email, then try again.
                        </p>
                    </div>
                </div>
                <Button onClick={handleLink} disabled={linking} className="h-11 w-full">
                    {linking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Link my account
                </Button>
            </CardContent>
        </Card>
    )
}