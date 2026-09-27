'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Id } from '../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { MemberCombobox } from '@/components/ui/member-combobox'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Plus, X } from 'lucide-react'

interface MemberOption {
    id: string
    name: string
    email?: string
    avatar?: string
    initials: string
}

interface UnitAdminsManagerProps {
    unitId: string
    members: MemberOption[]
    disabled?: boolean
}

export function UnitAdminsManager({ unitId, members, disabled }: UnitAdminsManagerProps) {
    const { toast } = useToast()
    const allAdmins = useQuery(api.unit_admins.listByUnit, { unit_id: unitId as Id<'units'> })
    const addAdmin = useMutation(api.unit_admins.addAdmin)
    const removeAdmin = useMutation(api.unit_admins.removeAdmin)

    const [selectedMember, setSelectedMember] = useState<string | undefined>()
    const [busy, setBusy] = useState(false)

    // The primary leader is managed by the "Unit Leader" field above; this
    // panel manages the additional admins who share the same access.
    const admins = allAdmins?.filter((a: any) => !a.is_primary)
    const adminMemberIds = new Set((allAdmins || []).map((a: any) => a.member_id as string))
    const selectableMembers = members.filter((m) => !adminMemberIds.has(m.id))

    const handleAdd = async () => {
        if (!selectedMember) return
        setBusy(true)
        try {
            await addAdmin({ unit_id: unitId as Id<'units'>, member_id: selectedMember as Id<'members'> })
            setSelectedMember(undefined)
            toast({ title: 'Admin added', description: 'The member now has admin access to this unit.' })
        } catch (e: any) {
            toast({ title: "Couldn't add the admin", description: e?.message ?? 'Try again in a moment.', variant: 'destructive' })
        } finally {
            setBusy(false)
        }
    }

    const handleRemove = async (memberId: string) => {
        setBusy(true)
        try {
            await removeAdmin({ unit_id: unitId as Id<'units'>, member_id: memberId as Id<'members'> })
            toast({ title: 'Admin removed' })
        } catch (e: any) {
            toast({ title: "Couldn't remove the admin", description: e?.message ?? 'Try again in a moment.', variant: 'destructive' })
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-3">
            <Label className="text-sm font-medium">
                Other admins
            </Label>
            <p className="text-xs text-muted-foreground -mt-1">
                These people share the same admin access as the unit leader. Set the primary leader in the field above.
            </p>

            <div className="space-y-2">
                {admins === undefined ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading admins…
                    </div>
                ) : admins.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No other admins yet.</p>
                ) : (
                    admins.map((a: any) => (
                        <div
                            key={a.id}
                            className="flex items-center justify-between rounded-md border border-border/50 bg-background/50 px-3 py-2"
                        >
                            <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{a.member_name}</div>
                                {a.member_email && (
                                    <div className="text-xs text-muted-foreground truncate">{a.member_email}</div>
                                )}
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={disabled || busy}
                                onClick={() => handleRemove(a.member_id)}
                                title="Remove admin"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ))
                )}
            </div>

            <div className="flex items-end gap-2">
                <div className="flex-1">
                    <MemberCombobox
                        members={selectableMembers}
                        value={selectedMember}
                        onValueChange={(value) => setSelectedMember(value === 'none' ? undefined : value)}
                        placeholder="Add an admin…"
                        disabled={disabled || busy}
                    />
                </div>
                <Button
                    type="button"
                    onClick={handleAdd}
                    disabled={disabled || busy || !selectedMember}
                >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    <span className="ml-1">Add</span>
                </Button>
            </div>
        </div>
    )
}
