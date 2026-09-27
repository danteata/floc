"use client"

import { useState } from "react"
import { Copy, Link2, Loader2, Trash2 } from "lucide-react"
import { format } from "date-fns"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { describeStatuses, titleCase } from "@/lib/display"

interface ShareAbsentLinkDialogProps {
  organizationId: Id<"organizations">
  eventType: string
  eventTypeLabel: string
  date: Date
  /** The filters on screen; the link shows the same list. */
  unitId?: Id<"units">
  unitName?: string
  statuses?: string[]
  minConsecutive?: number
  /** How many people the list on screen has, when the caller knows. */
  count?: number
  trigger?: React.ReactNode
}

const DEFAULT_STATUSES = ["active", "visitor"]

function describeScope(unitName: string | null | undefined, statuses: string[] | undefined, minConsecutive: number | null | undefined) {
  return [
    unitName ?? "All units",
    describeStatuses(statuses ?? DEFAULT_STATUSES),
    minConsecutive ? `missed ${minConsecutive} or more in a row` : null,
  ].filter(Boolean).join(" · ")
}

export function ShareAbsentLinkDialog({
  organizationId,
  eventType,
  eventTypeLabel,
  date,
  unitId,
  unitName,
  statuses,
  minConsecutive,
  count,
  trigger,
}: ShareAbsentLinkDialogProps) {
  const [open, setOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()

  const dateStr = format(date, "yyyy-MM-dd")

  const activeShares = useQuery(
    api.absentShares.listActive,
    open ? { organization_id: organizationId, event_type: eventType, date: dateStr } : "skip"
  )
  const createShare = useMutation(api.absentShares.create)
  const revokeShare = useMutation(api.absentShares.revoke)

  const buildUrl = (token: string) => `${window.location.origin}/share/absent/${token}`

  const handleCreate = async () => {
    setIsCreating(true)
    try {
      const { token } = await createShare({
        organization_id: organizationId,
        event_type: eventType,
        date: dateStr,
        unit_id: unitId,
        statuses: statuses ?? DEFAULT_STATUSES,
        min_consecutive: minConsecutive,
      })
      await navigator.clipboard.writeText(buildUrl(token))
      toast({
        title: "Link created",
        description: "It's on your clipboard and stops working after 30 days.",
      })
    } catch (err) {
      toast({
        title: "Couldn't create the link",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleCopy = async (token: string) => {
    await navigator.clipboard.writeText(buildUrl(token))
    toast({ title: "Link copied" })
  }

  const handleRevoke = async (id: Id<"absent_member_shares">) => {
    try {
      await revokeShare({ id })
      toast({ title: "Link turned off" })
    } catch (err) {
      toast({
        title: "Couldn't turn off the link",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Link2 className="mr-2 h-4 w-4" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share the absent list</DialogTitle>
          <DialogDescription>
            Anyone with the link can see names, phone numbers and how many times in a row each
            person has missed {titleCase(eventTypeLabel)} on {format(date, "d MMM yyyy")}, without
            signing in. Share it as carefully as a phone list.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <p className="font-medium text-foreground">
            {count === undefined
              ? "The link will show"
              : `The link will show these ${count} ${count === 1 ? "person" : "people"}`}
          </p>
          <p className="mt-0.5 text-muted-foreground">{describeScope(unitName, statuses, minConsecutive)}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            It stays up to date: anyone marked present later drops off the list.
          </p>
        </div>

        <Button onClick={handleCreate} disabled={isCreating} className="w-full">
          {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
          Create a new link
        </Button>

        {activeShares && activeShares.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Links already shared for this service</p>
            {activeShares.map((share) => (
              <div key={share._id} className="space-y-1">
              <p className="text-xs text-muted-foreground">{describeScope(share.unit_name, share.statuses, share.min_consecutive)}</p>
              <div className="flex min-w-0 items-center gap-2">
                <Input readOnly value={buildUrl(share.token)} className="text-xs" />
                <Button variant="outline" size="icon" onClick={() => handleCopy(share.token)} aria-label="Copy link" title="Copy link">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => handleRevoke(share._id)} aria-label="Turn off link" title="Turn off link">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
