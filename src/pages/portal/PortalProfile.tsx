'use client'

import { useQuery } from "convex/react"
import { Link } from "react-router-dom"
import { User, UserRoundX, Mail, Phone, MapPin, Calendar, Users as UsersIcon } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { MemberAvatar } from "@/components/ui/member-avatar"
import { Badge } from "@/components/ui/badge"
import { formatDay } from "./format"

export default function PortalProfile() {
    const profile = useQuery(api.check_ins.getMyProfile, {})

    if (profile === undefined) {
        return (
            <Card>
                <CardContent className="p-6 space-y-3">
                    <Skeleton className="h-16 w-16 rounded-full" />
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-32" />
                </CardContent>
            </Card>
        )
    }

    if (profile === null) {
        return (
            <Card>
                <CardContent>
                    <EmptyState
                        icon={UserRoundX}
                        title="Your account isn't linked to a member yet"
                        description="Link your account to your church's member record to see your details here."
                        action={
                            <Button asChild size="sm">
                                <Link to="/portal/link">Link my account</Link>
                            </Button>
                        }
                    />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <User className="h-4 w-4 text-muted-foreground" />
                    My profile
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="flex items-center gap-4">
                    <MemberAvatar name={profile.name} src={profile.avatar_url} className="size-16 text-lg" />
                    <div className="min-w-0">
                        <p className="text-lg font-semibold break-words">{profile.name}</p>
                        <p className="text-sm text-muted-foreground break-words">{profile.organization_name}</p>
                        <Badge variant="secondary" className="mt-1 capitalize">{profile.status}</Badge>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field icon={<Mail className="h-4 w-4" />} label="Email" value={profile.email} />
                    <Field icon={<Phone className="h-4 w-4" />} label="Phone" value={profile.phone} />
                    <Field icon={<Calendar className="h-4 w-4" />} label="Date of birth" value={formatDay(profile.dob)} />
                    <Field icon={<Calendar className="h-4 w-4" />} label="Joined" value={formatDay(profile.joined_date)} />
                    <Field
                        icon={<MapPin className="h-4 w-4" />}
                        label="Address"
                        value={[profile.address, profile.city, profile.state, profile.country].filter(Boolean).join(", ") || undefined}
                    />
                    <Field
                        icon={<UsersIcon className="h-4 w-4" />}
                        label="Units"
                        value={profile.unit_names?.length ? profile.unit_names.join(", ") : undefined}
                    />
                </div>

                <p className="text-xs text-muted-foreground">
                    Something out of date? Ask your church office to update it for you.
                </p>
            </CardContent>
        </Card>
    )
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
    return (
        <div className="flex items-start gap-3">
            <div className="mt-0.5 text-muted-foreground">{icon}</div>
            <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={value ? "text-sm break-words" : "text-sm text-muted-foreground"}>{value || "Not given"}</p>
            </div>
        </div>
    )
}