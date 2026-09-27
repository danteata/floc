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
import { Loader2, Plus, Layers } from 'lucide-react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

interface Unit {
  _id: string
  name: string
}

interface CreateUnitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableUnits: Unit[]
  onCreateUnit: (data: {
    name: string
    description: string
    type: 'administrative' | 'functional' | 'geographic'
    category: string
    unitId?: string
    leader_id?: string
  }) => Promise<void>
  creating: boolean
  // When creating via "Add sub-unit", pre-selects this unit as the parent.
  defaultParentId?: string | null
}

export function CreateUnitDialog({
  open,
  onOpenChange,
  availableUnits,
  onCreateUnit,
  creating,
  defaultParentId
}: CreateUnitDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'administrative' | 'functional' | 'geographic'>('administrative')
  const [category, setCategory] = useState('')
  const [unitId, setUnitId] = useState('')
  const [leaderId, setLeaderId] = useState<string | undefined>()

  // Pre-select the parent when opened from a unit's "Add sub-unit" action.
  useEffect(() => {
    if (open) setUnitId(defaultParentId || '')
  }, [open, defaultParentId])

  // Fetch members for leader selection
  const membersData = useQuery(api.members.getAll, open ? {} : "skip")
  const availableMembers = membersData?.map((m: any) => ({
    id: m._id,
    name: m.name,
    email: m.email,
    avatar: m.avatar_url,
    initials: m.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
  })) || []

  const handleSubmit = async () => {
    if (!name.trim()) return;
    try {
      await onCreateUnit({
        name: name.trim(),
        description: description.trim(),
        type,
        category: category,
        unitId: unitId === 'none' ? undefined : (unitId || undefined),
        leader_id: leaderId,
      })
      resetForm()
      onOpenChange(false)
    } catch (error) { }
  }

  const resetForm = () => {
    setName('')
    setDescription('')
    setType('administrative')
    setCategory('')
    setUnitId('')
    setLeaderId(undefined)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Layers className="h-4 w-4 text-muted-foreground" />
            New unit
          </DialogTitle>
          <DialogDescription>
            Add a group, team or department to your church.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ushers, youth ministry"
              className="bg-background/50 border-input-border focus:ring-primary/20"
              disabled={creating}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this group do?"
              className="bg-background/50 border-input-border focus:ring-primary/20"
              disabled={creating}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Parent unit</Label>
              <Select value={unitId} onValueChange={setUnitId} disabled={creating}>
                <SelectTrigger className="bg-background/50 border-input-border">
                  <SelectValue placeholder="Choose a unit (optional)" />
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
                onValueChange={(value: any) => setType(value)}
                disabled={creating}
              >
                <SelectTrigger className="bg-background/50 border-input-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="administrative">Administrative</SelectItem>
                  <SelectItem value="functional">Functional</SelectItem>
                  <SelectItem value="geographic">Geographic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Category</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Outreach, youth, regional…"
              className="bg-background/50 border-input-border focus:ring-primary/20"
              disabled={creating}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Leader</Label>
            <MemberCombobox
              members={availableMembers}
              value={leaderId}
              onValueChange={(value) => setLeaderId(value === "none" ? undefined : value)}
              placeholder="Choose a leader…"
              disabled={creating}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            className="shadow-soft hover:shadow-lg transition-all"
            onClick={handleSubmit}
            disabled={creating || !name.trim()}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Create unit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
