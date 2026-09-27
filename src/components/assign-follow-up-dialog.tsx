"use client"

import { useMemo, useState } from "react"
import { HeartHandshake, Loader2 } from "lucide-react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

interface AssignFollowUpDialogProps {
  organizationId: Id<"organizations">
  members: Array<{ id: string; name: string; household_id?: string }>
  trigger?: React.ReactNode
}

export function AssignFollowUpDialog({
  organizationId,
  members,
  trigger,
}: AssignFollowUpDialogProps) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [assignedTo, setAssignedTo] = useState<string>("")
  const [note, setNote] = useState("")
  const [includeHousehold, setIncludeHousehold] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const unitAdmins = useQuery(
    api.unit_admins.listByOrg,
    open ? { organization_id: organizationId } : "skip",
  )
  const allMembers = useQuery(
    api.members.getAll,
    open ? { organization_id: organizationId } : "skip",
  )
  const createTask = useMutation(api.care_tasks.create)
  const createTaskForHousehold = useMutation(api.care_tasks.createForHousehold)

  const hasAnyHousehold = members.some((m) => m.household_id)

  const assigneeOptions = useMemo(() => {
    if (!unitAdmins || !allMembers) return []
    const memberNames = new Map<string, string>(
      allMembers.map((m) => [(m._id ?? m.id) as string, m.name]),
    )
    const seen = new Set<string>()
    const options: Array<{ id: string; name: string }> = []
    for (const admin of unitAdmins) {
      const id = admin.member_id as string
      if (seen.has(id)) continue
      const name = memberNames.get(id)
      if (!name) continue
      seen.add(id)
      options.push({ id, name })
    }
    return options.sort((a, b) => a.name.localeCompare(b.name))
  }, [unitAdmins, allMembers])

  // Reset + pre-check the full visible list whenever the dialog opens.
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setSelected(new Set(members.map((m) => m.id)))
      setAssignedTo("")
      setNote("")
      setIncludeHousehold(false)
    }
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = async () => {
    if (!assignedTo || selected.size === 0) return
    setIsSubmitting(true)
    try {
      const membersById = new Map(members.map((m) => [m.id, m]))
      const handledHouseholds = new Set<string>()
      // Each call resolves to how many follow-ups it created and how many
      // members already had one open with this person.
      const calls: Promise<{ created: number; skipped: number }>[] = []

      for (const memberId of selected) {
        const member = membersById.get(memberId)
        const householdId = includeHousehold ? member?.household_id : undefined

        if (householdId) {
          if (handledHouseholds.has(householdId)) continue
          handledHouseholds.add(householdId)
          calls.push(
            createTaskForHousehold({
              household_id: householdId as Id<"households">,
              assigned_to: assignedTo as Id<"members">,
              note: note || undefined,
            }),
          )
        } else {
          calls.push(
            createTask({
              member_id: memberId as Id<"members">,
              assigned_to: assignedTo as Id<"members">,
              note: note || undefined,
            }).then((r) => ({ created: r.created ? 1 : 0, skipped: r.created ? 0 : 1 })),
          )
        }
      }

      const results = await Promise.all(calls)
      const created = results.reduce((sum, r) => sum + r.created, 0)
      const skipped = results.reduce((sum, r) => sum + r.skipped, 0)
      const parts: string[] = []
      if (created > 0) parts.push(`${created} follow-up${created === 1 ? "" : "s"} created`)
      if (skipped > 0) parts.push(`${skipped} already open`)
      toast({
        title: created > 0 ? "Follow-up assigned" : "Follow-up already open",
        description: `${parts.join(", ")}.${
          includeHousehold && handledHouseholds.size > 0 ? " Household members included." : ""
        }`,
      })
      setOpen(false)
    } catch (err) {
      toast({
        title: "Couldn't assign follow-up",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            Follow up
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeartHandshake className="h-4 w-4 text-muted-foreground" />
            Assign a follow-up
          </DialogTitle>
          <DialogDescription>
            Choose who reaches out to these members. They get a care task and can
            mark it as contacted or resolved as they go.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
            {members.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No members in this list.</p>
            )}
            {members.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
              >
                <Checkbox
                  checked={selected.has(m.id)}
                  onCheckedChange={() => toggle(m.id)}
                />
                {m.name}
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Assign to</label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    unitAdmins === undefined ? "Loading leaders…" : "Choose a leader"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {assigneeOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {unitAdmins?.length === 0 && (
              <p className="text-xs text-muted-foreground">
                There are no leaders to assign yet. Add unit leaders first.
              </p>
            )}
          </div>

          {hasAnyHousehold && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={includeHousehold}
                onCheckedChange={(c) => setIncludeHousehold(c === true)}
              />
              Also include their household members
            </label>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Note (optional)</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this follow-up is needed…"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !assignedTo || selected.size === 0}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
