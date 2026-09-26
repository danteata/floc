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

export default function PortalLink() {
    const status = useQuery(api.check_ins.getMyLinkStatus, {})
    const linkAccount = useMutation(api.check_ins.linkMyAccount)
    const [linking, setLinking] = useState(false)

    const handleLink = async () => {
        setLinking(true)
        try {
            const res: any = await linkAccount({})
            if (res.status === "linked") {
                toast.success(`Linked to ${res.member_name}`)
            } else if (res.status === "already_linked") {
                toast.info(`Already linked to ${res.member_name}`)
            } else if (res.status === "no_matching_member") {
                toast.error("No member record matches your email. Ask your church admin to add you as a member and grant app access.")
            } else if (res.status === "wrong_org") {
                toast.error("That member record belongs to a different organization.")
            }
        } catch (err: any) {
            toast.error(err?.message ?? "Linking failed")
        } finally {
            setLinking(false)
        }
    }

    if (status === undefined) {
        return (
            <Card className="border-border/50 rounded-lg">
                <CardContent className="p-8 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        )
    }

    if (!status.authenticated) {
        return (
            <Card className="border-border/50 rounded-lg">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    Sign in to link your member account.
                </CardContent>
            </Card>
        )
    }

    if ((status as any).linked) {
        const s = status as any
        return (
            <Card className="border-border/50 rounded-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
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
                        <a href="/portal">Go to portal</a>
                    </Button>
                </CardContent>
            </Card>
        )
    }

    const s = status as any
    return (
        <Card className="border-border/50 rounded-lg">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <LinkIcon className="h-4 w-4" />
                    Link your member account
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label>Your email</Label>
                    <Input value={s.email ?? ""} disabled />
                    <p className="text-xs text-muted-foreground">
                        We'll look up a member record matching this email in your church's database.
                    </p>
                </div>
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm flex gap-2">
                    <AlertCircle className="h-4 w-4 text-warning-strong shrink-0 mt-0.5" />
                    <div>
                        <p className="font-medium">If linking fails</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Your church admin may not have added you as a member yet, or your member email doesn't match this account's email. Ask them to add you and grant app access.
                        </p>
                    </div>
                </div>
                <Button onClick={handleLink} disabled={linking} className="w-full">
                    {linking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Link my account
                </Button>
            </CardContent>
        </Card>
    )
}