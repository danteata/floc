'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, Edit } from 'lucide-react'

interface UnitWithDetails {
  id: string
  name: string
  description?: string
  unit_id: string
}

interface OverrideUnitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedUnit: UnitWithDetails | null
  onOverrideUnit: (data: {
    name: string
    description: string
  }) => Promise<void>
  overriding: boolean
}

export function OverrideUnitDialog({
  open,
  onOpenChange,
  selectedUnit,
  onOverrideUnit,
  overriding
}: OverrideUnitDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = async () => {
    if (!name.trim()) {
      return
    }

    try {
      await onOverrideUnit({
        name: name.trim(),
        description: description.trim()
      })

      // Reset form
      setName('')
      setDescription('')
      onOpenChange(false)
    } catch (error) {
      // Error is handled by parent component
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !overriding) {
      // Reset form when closing
      setName('')
      setDescription('')
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change this unit</DialogTitle>
          <DialogDescription>
            Give this unit its own name and description here. The template stays as it is.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>From template</Label>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline">
                {selectedUnit?.name}
              </Badge>
            </div>
          </div>

          <div>
            <Label htmlFor="override-name">Name *</Label>
            <Input
              id="override-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name for your church"
              disabled={overriding}
            />
          </div>

          <div>
            <Label htmlFor="override-description">Description</Label>
            <Input
              id="override-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              disabled={overriding}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={overriding}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={overriding || !name.trim()}
          >
            {overriding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Edit className="h-4 w-4 mr-2" />
                Save changes
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
