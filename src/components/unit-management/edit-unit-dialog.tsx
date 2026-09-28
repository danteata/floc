'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { MemberCombobox } from '@/components/ui/member-combobox'
import { UnitAdminsManager } from './unit-admins-manager'
import { Loader2, Save, Layers } from 'lucide-react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

interface Unit {
    _id: string
    name: string
}

interface TargetUnit {
    _id: string
    name: string
    description?: string
    type?: string
    category?: string
    parent_unit_id?: string
    leader_id?: string
}

const OFFERED_TYPES = ['administrative', 'functional', 'geographic', 'ministry']

/** "sub_unit" -> "Sub unit": a stored type as people read it. */
function typeLabel(type: string): string {
    const t = type.replace(/[_-]+/g, ' ')
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}

interface EditUnitDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    unit: TargetUnit | null
    availableUnits: Unit[]
    onUpdateUnit: (id: string, data: {
        name: string
        description: string
        type: string
        category: string
        unit_id: string
        leader_id?: string
    }) => Promise<void>
    updating: boolean
}

export function EditUnitDialog({
    open,
    onOpenChange,
    unit,
    availableUnits,
    onUpdateUnit,
    updating
}: EditUnitDialogProps) {
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [type, setType] = useState<string>('administrative')
    const [category, setCategory] = useState('')
    const [unitId, setUnitId] = useState('')
    const [leaderId, setLeaderId] = useState<string | undefined>()

    // Fetch members for leader selection
    const membersData = useQuery(api.members.getAll, open ? {} : "skip")
    const availableMembers = membersData?.map((m: any) => ({
        id: m._id,
        name: m.name,
        email: m.email,
        avatar: m.avatar_url,
        initials: m.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
    })) || []

    // Populate form when unit changes
    useEffect(() => {
        if (unit) {
            setName(unit.name || '')
            setDescription(unit.description || '')
            setType(unit.type || 'administrative')
            setCategory(unit.category || '')
            setUnitId(unit.parent_unit_id || 'none')
            setLeaderId(unit.leader_id || undefined)
        }
    }, [unit])

    // Ministry units are functional ones by another name (see unit-card, filters).
    const hasCategory = type === 'functional' || type === 'ministry'

    const handleSubmit = async () => {
        if (!name.trim() || !unitId || !unit) return;
        try {
            await onUpdateUnit(unit._id, {
                name: name.trim(),
                description: description.trim(),
                type,
                category: hasCategory ? category : '',
                unit_id: unitId === 'none' ? '' : unitId,
                leader_id: leaderId,
            })
            onOpenChange(false)
        } catch (error) { }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        Edit unit
                    </DialogTitle>
                    <DialogDescription>
                        Change this unit's name, place in the structure or leader.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Name *</Label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Worship team"
                            className="bg-background/50 border-input-border focus:ring-primary/20"
                            disabled={updating}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Description</Label>
                        <Input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What does this group do?"
                            className="bg-background/50 border-input-border focus:ring-primary/20"
                            disabled={updating}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Parent unit *</Label>
                            <Select value={unitId} onValueChange={setUnitId} disabled={updating}>
                                <SelectTrigger className="bg-background/50 border-input-border">
                                    <SelectValue placeholder="Choose a unit" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None (top level)</SelectItem>
                                    {availableUnits.map((unit) => (
                                        <SelectItem key={unit._id} value={unit._id}>
                                            {unit.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Type *</Label>
                            <Select
                                value={type}
                                onValueChange={setType}
                                disabled={updating}
                            >
                                <SelectTrigger className="bg-background/50 border-input-border">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="administrative">Administrative</SelectItem>
                                    <SelectItem value="functional">Functional</SelectItem>
                                    <SelectItem value="geographic">Geographic</SelectItem>
                                    <SelectItem value="ministry">Ministry</SelectItem>
                                    {/* A type set elsewhere (e.g. imported) stays selected instead of being replaced on save. */}
                                    {!OFFERED_TYPES.includes(type) && (
                                        <SelectItem value={type}>{typeLabel(type)}</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {hasCategory && (
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Category</Label>
                            <Input
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                placeholder="Youth, worship, media…"
                                className="bg-background/50 border-input-border focus:ring-primary/20"
                                disabled={updating}
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Leader</Label>
                        <MemberCombobox
                            members={availableMembers}
                            value={leaderId}
                            onValueChange={(value) => setLeaderId(value === "none" ? undefined : value)}
                            placeholder="Choose a leader…"
                            disabled={updating}
                        />
                    </div>

                    {unit && (
                        <div className="pt-2 border-t border-border/50">
                            <UnitAdminsManager
                                unitId={unit._id}
                                members={availableMembers}
                                disabled={updating}
                            />
                        </div>
                    )}

                    {/* Removed isTemplate checkbox as it's not in the new schema */}
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={updating}
                    >
                        Cancel
                    </Button>
                    <Button
                        className="shadow-soft hover:shadow-lg transition-all"
                        onClick={handleSubmit}
                        disabled={updating || !name.trim() || !unitId}
                    >
                        {updating ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        Save changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
