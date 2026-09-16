"use client"

import { useState } from "react"
import { Copy, Loader2, Share2, Trash2 } from "lucide-react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

/** Keep in sync with MEMBER_SHARE_COLUMNS in convex/memberShares.ts. */
const COLUMN_OPTIONS = [
  { key: "phone", label: "Phone number" },
  { key: "email", label: "Email" },
  { key: "status", label: "Status" },
  { key: "units", label: "Units" },
  { key: "household", label: "Household" },
  { key: "address", label: "Address" },
  { key: "gender", label: "Gender" },
  { key: "joined_date", label: "Join date" },
] as const

const EXPIRY_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "0", label: "Never expires" },
]

export interface ShareMembersFilters {
  organization_id: Id<"organizations">
  filter: "active" | "archived" | "all"
  search?: string
  statuses?: string[]
  unit_ids?: Id<"units">[]
  label_ids?: Id<"labels">[]
  household_ids?: Id<"households">[]
  no_household?: boolean
  risk_levels?: string[]
}

interface ShareMembersLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: ShareMembersFilters
  /** Human-readable summary of the active filters, shown on the public page. */
  filterSummary: string
  /** Total members matching the filters server-side, not just the loaded page. */
  totalCount?: number
  selectedMemberIds: string[]
}

export function ShareMembersLinkDialog({
  open,
  onOpenChange,
  filters,
  filterSummary,
  totalCount,
  selectedMemberIds,
}: ShareMembersLinkDialogProps) {
  const hasSelection = selectedMemberIds.length > 0
  const [scope, setScope] = useState<"filtered" | "selected">("filtered")
  const [title, setTitle] = useState("Members")
  const [expiry, setExpiry] = useState("30")
  const [columns, setColumns] = useState<string[]>(["phone", "units"])
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()

  const activeShares = useQuery(
    api.memberShares.listActive,
    open ? { organization_id: filters.organization_id } : "skip",
  )
  const createShare = useMutation(api.memberShares.create)
  const revokeShare = useMutation(api.memberShares.revoke)

  // Selecting rows then clearing the selection shouldn't leave the dialog
  // pointing at an empty list.
  const effectiveScope = hasSelection ? scope : "filtered"
  const shareCount = effectiveScope === "selected" ? selectedMemberIds.length : totalCount

  const buildUrl = (token: string) => `${window.location.origin}/share/members/${token}`

  const toggleColumn = (key: string) =>
    setColumns((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]))

  const handleCreate = async () => {
    setIsCreating(true)
    try {
      const result = await createShare({
        ...filters,
        title,
        description:
          effectiveScope === "selected"
            ? `${selectedMemberIds.length} selected member${selectedMemberIds.length === 1 ? "" : "s"}`
            : filterSummary || undefined,
        columns,
        member_ids:
          effectiveScope === "selected"
            ? (selectedMemberIds as Id<"members">[])
            : undefined,
        expires_in_days: Number(expiry),
      })
      await navigator.clipboard.writeText(buildUrl(result.token))
      toast({
        title: "Link created",
        description: result.truncated
          ? `Copied to your clipboard. Only the first ${result.limit.toLocaleString()} members were included — narrow the filters to share the rest.`
          : `${result.count.toLocaleString()} member${result.count === 1 ? "" : "s"} — the link was copied to your clipboard.`,
      })
    } catch (err) {
      toast({
        title: "Couldn't create link",
        description: err instanceof Error ? err.message : "Please try again.",
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

  const handleRevoke = async (id: Id<"member_list_shares">) => {
    try {
      await revokeShare({ id })
      toast({ title: "Link revoked" })
    } catch (err) {
      toast({
        title: "Couldn't revoke link",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share this list</DialogTitle>
          <DialogDescription>
            Anyone with the link can view the list &mdash; no login required. The people on it are
            fixed when you create the link; their details stay up to date. Treat it like a phone
            list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {hasSelection && (
            <div className="space-y-2">
              <Label>Who to include</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={effectiveScope === "filtered" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setScope("filtered")}
                >
                  Whole list{typeof totalCount === "number" ? ` (${totalCount.toLocaleString()})` : ""}
                </Button>
                <Button
                  type="button"
                  variant={effectiveScope === "selected" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setScope("selected")}
                >
                  Selected ({selectedMemberIds.length})
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="share-title">Title</Label>
            <Input
              id="share-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Members"
            />
            {effectiveScope === "filtered" && filterSummary && (
              <p className="text-xs text-muted-foreground">Filters: {filterSummary}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Columns to include</Label>
            <p className="text-xs text-muted-foreground">
              Names are always shown. Anything you leave unchecked is never sent to the page.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {COLUMN_OPTIONS.map((col) => (
                <label
                  key={col.key}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-2 text-sm cursor-pointer",
                    columns.includes(col.key) ? "border-primary/50 bg-primary/5" : "border-border",
                  )}
                >
                  <Checkbox
                    checked={columns.includes(col.key)}
                    onCheckedChange={() => toggleColumn(col.key)}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="share-expiry">Link expires</Label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger id="share-expiry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {activeShares && activeShares.length > 0 && (
            <div className="space-y-2">
              <Label>Active links</Label>
              {activeShares.map((share) => (
                <div key={share._id} className="space-y-1 rounded-lg border p-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">
                      {share.title} &middot; {share.member_count.toLocaleString()} member
                      {share.member_count === 1 ? "" : "s"}
                      {share.created_by_name ? ` · ${share.created_by_name}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={buildUrl(share.token)} className="text-xs" />
                    <Button variant="outline" size="icon" onClick={() => handleCopy(share.token)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => handleRevoke(share._id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleCreate} disabled={isCreating || shareCount === 0} className="w-full">
            {isCreating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Share2 className="mr-2 h-4 w-4" />
            )}
            Create link{typeof shareCount === "number" ? ` for ${shareCount.toLocaleString()} member${shareCount === 1 ? "" : "s"}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
