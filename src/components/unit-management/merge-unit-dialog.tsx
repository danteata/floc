'use client'

import { useState } from 'react'
import { useQuery } from 'convex/react'
import { Button } from '@/components/ui/button'
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
import { Loader2, GitMerge, AlertTriangle, ArrowRight } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

interface UnitOption {
  _id: string
  name: string
}

interface MergeUnitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // The unit being merged away (source).
  source: UnitOption | null
  // All units, used to choose the survivor (target).
  units: UnitOption[]
  onMerge: (sourceId: string, targetId: string) => Promise<void>
  merging: boolean
}

export function MergeUnitDialog({ open, onOpenChange, source, units, onMerge, merging }: MergeUnitDialogProps) {
  const [targetId, setTargetId] = useState<string>('')

  const preview = useQuery(
    api.units.mergePreview,
    open && source && targetId
      ? { source_id: source._id as Id<'units'>, target_id: targetId as Id<'units'> }
      : 'skip'
  )

  const candidates = units.filter((u) => u._id !== source?._id)

  const handleMerge = async () => {
    if (!source || !targetId) return
    try {
      await onMerge(source._id, targetId)
      setTargetId('')
      onOpenChange(false)
    } catch { /* handled by caller */ }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setTargetId(''); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <GitMerge className="h-4 w-4 text-muted-foreground" />
            Merge unit
          </DialogTitle>
          <DialogDescription>
            Move everything from <span className="font-medium text-foreground">{source?.name}</span> into
            another unit, then delete it. Its members, admins and sub-units move over, along with any events and automations set up for it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Merge into *</Label>
            <Select value={targetId} onValueChange={setTargetId} disabled={merging}>
              <SelectTrigger className="bg-background/50 border-input-border">
                <SelectValue placeholder="Choose the unit to keep" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((u) => (
                  <SelectItem key={u._id} value={u._id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {targetId && preview && (
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <span>{preview.sourceName}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span>{preview.targetName}</span>
              </div>
              <ul className="text-muted-foreground text-sm space-y-1">
                <li>• {preview.newMembers} member{preview.newMembers === 1 ? '' : 's'} will move over
                  {preview.overlap > 0 && <span> ({preview.overlap} already in {preview.targetName}, kept once)</span>}
                  , for {preview.resultingMembers} total.
                </li>
                {preview.sourceAdmins > 0 && <li>• {preview.sourceAdmins} admin{preview.sourceAdmins === 1 ? '' : 's'} move over.</li>}
                {preview.sourceChildren > 0 && <li>• {preview.sourceChildren} sub-unit{preview.sourceChildren === 1 ? '' : 's'} move{preview.sourceChildren === 1 ? 's' : ''} beneath it.</li>}
              </ul>
            </div>
          )}

          {targetId && (
            <div className="flex items-start gap-2 text-sm text-warning-strong dark:text-warning-strong">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span><span className="font-medium">{source?.name}</span> will be deleted. Its members and records stay, in the unit you keep.</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={merging}>Cancel</Button>
          <Button onClick={handleMerge} disabled={merging || !targetId} className="shadow-soft">
            {merging ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <GitMerge className="h-4 w-4 mr-2" />}
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
