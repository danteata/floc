"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Home, Loader2, Plus, Search, Star, Trash2, UserMinus, UserPlus } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import { useOrganization } from "@/hooks/use-organization"
import { MemberAvatar } from "@/components/ui/member-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { useToast } from "@/hooks/use-toast"
import { convertPlusCodeToLatLng } from "@/lib/google-maps-utils"

/** Last whitespace-separated token of a "First Last" name; "" if unavailable. */
function surnameOf(name: string | undefined): string {
  if (!name) return ""
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ""
}

export function HouseholdsContent() {
  const { organization } = useOrganization()
  const households = useQuery(
    api.households.list,
    organization ? { organization_id: organization._id } : "skip",
  )
  const [creating, setCreating] = useState(false)
  const [managing, setManaging] = useState<Id<"households"> | null>(null)
  const [search, setSearch] = useState("")

  const totalMembers = households?.reduce((sum, h) => sum + h.members.length, 0) ?? 0

  const searchQuery = search.trim().toLowerCase()
  const filteredHouseholds = (households ?? []).filter(
    (h) =>
      !searchQuery ||
      h.name.toLowerCase().includes(searchQuery) ||
      h.members.some((m) => m.name.toLowerCase().includes(searchQuery)),
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Group a family under one address for the map, follow-up and check-in.
          </p>
          {households && households.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {households.length.toLocaleString()} household{households.length === 1 ? "" : "s"}
              {" · "}
              {totalMembers.toLocaleString()} member{totalMembers === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New household
        </Button>
      </div>

      {households === undefined ? (
        <LoadingState />
      ) : households.length === 0 ? (
        <EmptyState
          icon={Home}
          title="No households yet"
          description="Create one to group a family under a shared address."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New household
            </Button>
          }
        />
      ) : (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search households or members…"
              className="pl-9"
            />
          </div>

          {filteredHouseholds.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No households match"
              description={`Nothing found for "${search}".`}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredHouseholds.map((h) => (
                <Card key={h._id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    {/* CardHeader lays this out as a CSS grid item, not a
                        flex child: min-w-0 on the inner span alone isn't
                        enough, since a grid item's own intrinsic min-width
                        (as computed by its ancestor grid) still defaults to
                        its content's full min-content size regardless of
                        flex-shrink settings among ITS OWN children. Without
                        min-w-0 here too, the grid track stays wide enough to
                        fit the whole unwrapped name, which is what was
                        pushing "Manage" off the card for longer names. */}
                    <CardTitle className="flex items-center justify-between text-base gap-2 min-w-0">
                      <span className="truncate flex-1 min-w-0">{h.name || "Unnamed household"}</span>
                      <Badge variant="secondary" className="shrink-0 font-normal">
                        {h.members.length} {h.members.length === 1 ? "member" : "members"}
                      </Badge>
                      <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setManaging(h._id)}>
                        Manage
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {h.address ? (
                      <p className="text-xs text-muted-foreground">
                        {h.address}
                        {h.city ? `, ${h.city}` : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">No address yet</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {h.members.length === 0 && (
                        <span className="text-xs text-muted-foreground">No members yet</span>
                      )}
                      {h.members.map((m) => (
                        <Badge key={m._id} variant="outline" className="gap-1 font-normal">
                          {m._id === h.head_of_household_id && (
                            <Star className="h-3 w-3 text-muted-foreground" aria-label="Head of household" />
                          )}
                          {m.name}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {creating && organization && (
        <CreateHouseholdDialog
          organizationId={organization._id}
          onClose={() => setCreating(false)}
        />
      )}
      {managing && (
        <ManageHouseholdDialog
          householdId={managing}
          onClose={() => setManaging(null)}
        />
      )}
    </div>
  )
}

function CreateHouseholdDialog({
  organizationId,
  onClose,
}: {
  organizationId: Id<"organizations">
  onClose: () => void
}) {
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [plusCode, setPlusCode] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const create = useMutation(api.households.create)
  const { toast } = useToast()

  const canSubmit = name.trim().length > 0

  const handleSubmit = async () => {
    if (!canSubmit) return
    setIsSubmitting(true)
    try {
      const latLng = plusCode ? await convertPlusCodeToLatLng(plusCode) : null
      await create({
        organization_id: organizationId,
        name: name.trim(),
        address: address || undefined,
        city: city || undefined,
        plus_code: plusCode || undefined,
        latitude: latLng?.lat,
        longitude: latLng?.lng,
      })
      toast({ title: "Household created", description: `${name.trim()} is ready for members.` })
      onClose()
    } catch (err) {
      toast({
        title: "Couldn't create household",
        description: err instanceof Error ? err.message : "Something went wrong. Try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New household</DialogTitle>
          <DialogDescription>
            Once it's created, choose Manage on its card to add members and a head of household.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Mensah household"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Address</label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">City</label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Plus code (for the map pin)</label>
            <Input
              value={plusCode}
              onChange={(e) => setPlusCode(e.target.value)}
              placeholder="e.g. MVG6+G2 Ashaley Botwe, Ghana"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !canSubmit}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ManageHouseholdDialog({
  householdId,
  onClose,
}: {
  householdId: Id<"households">
  onClose: () => void
}) {
  const household = useQuery(api.households.get, { id: householdId })
  const { organization } = useOrganization()
  const allMembers = useQuery(
    api.members.getAll,
    organization ? { organization_id: organization._id } : "skip",
  )
  const updateHousehold = useMutation(api.households.update)
  const addMember = useMutation(api.households.addMember)
  const removeMember = useMutation(api.households.removeMember)
  const removeHousehold = useMutation(api.households.remove)
  const { toast } = useToast()

  const [addSearch, setAddSearch] = useState("")
  const [address, setAddress] = useState<{
    name?: string
    address?: string
    city?: string
    plus_code?: string
  } | null>(null)

  const runOrToastError = async (action: () => Promise<unknown>) => {
    try {
      await action()
    } catch (err) {
      toast({
        title: "Couldn't update the household",
        description: err instanceof Error ? err.message : "Something went wrong. Try again.",
        variant: "destructive",
      })
    }
  }

  // Members not already in *any* household (not just this one). Adding
  // someone who already belongs elsewhere would silently move them, so they
  // shouldn't show up as a suggestion or search result at all. To reassign
  // someone, remove them from their current household first.
  const unassignedMembers = useMemo(
    () => (allMembers ?? []).filter((m) => !m.household_id),
    [allMembers],
  )

  // Same-surname suggestions: unassigned members who share a last name with
  // someone already in this household: the common case (kids, spouse) when
  // the family hasn't all been grouped yet.
  const surnameSuggestions = useMemo(() => {
    if (!household || household.members.length === 0) return []
    const surnames = new Set(
      household.members.map((m) => surnameOf(m.name)).filter(Boolean),
    )
    if (surnames.size === 0) return []
    return unassignedMembers
      .filter((m) => surnames.has(surnameOf(m.name)))
      .slice(0, 8)
  }, [unassignedMembers, household])

  const addCandidates = useMemo(() => {
    if (addSearch.trim().length < 2) return []
    const q = addSearch.toLowerCase()
    return unassignedMembers
      .filter((m) => m.name?.toLowerCase().includes(q))
      .slice(0, 8)
  }, [unassignedMembers, addSearch])

  if (household === undefined) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <LoadingState />
        </DialogContent>
      </Dialog>
    )
  }
  if (household === null) return null

  const effectiveAddress = address ?? {
    name: household.name,
    address: household.address,
    city: household.city,
    plus_code: household.plus_code,
  }
  const canSaveName = (effectiveAddress.name ?? "").trim().length > 0

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh] overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{household.name || "Manage household"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={effectiveAddress.name ?? ""}
              onChange={(e) => setAddress({ ...effectiveAddress, name: e.target.value })}
              placeholder="e.g. The Mensah household"
            />
            {!canSaveName && (
              <p className="text-xs text-destructive">Give the household a name.</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Members</label>
            <div className="rounded-md border divide-y">
              {household.members.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">No members yet. Add one below.</p>
              )}
              {household.members.map((m) => (
                <div key={m._id} className="flex items-center justify-between p-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <MemberAvatar name={m.name} src={m.avatar_url} size="sm" />
                    <span className="truncate text-sm">{m.name}</span>
                    {m._id === household.head_of_household_id && (
                      <Badge variant="outline" className="gap-1 font-normal">
                        <Star className="h-3 w-3 text-muted-foreground" /> Head
                      </Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {m._id !== household.head_of_household_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          runOrToastError(() =>
                            updateHousehold({ id: householdId, head_of_household_id: m._id }),
                          )
                        }
                      >
                        Make head
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => runOrToastError(() => removeMember({ member_id: m._id }))}
                    >
                      <UserMinus className="h-4 w-4" />
                      <span className="sr-only">Remove {m.name} from the household</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Add a member</label>

            {addSearch.trim().length === 0 && surnameSuggestions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Suggested: the same surname as someone already in this household
                </p>
                <div className="rounded-md border divide-y">
                  {surnameSuggestions.map((m) => (
                    <AddMemberRow
                      key={m._id ?? m.id}
                      member={m}
                      onAdd={() =>
                        runOrToastError(() =>
                          addMember({
                            household_id: householdId,
                            member_id: (m._id ?? m.id) as Id<"members">,
                          }),
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            <Input
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              placeholder="Search members to add…"
            />
            {addCandidates.length > 0 && (
              <div className="rounded-md border divide-y">
                {addCandidates.map((m) => (
                  <AddMemberRow
                    key={m._id ?? m.id}
                    member={m}
                    onAdd={() =>
                      runOrToastError(async () => {
                        await addMember({
                          household_id: householdId,
                          member_id: (m._id ?? m.id) as Id<"members">,
                        })
                        setAddSearch("")
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Address</label>
            <Input
              value={effectiveAddress.address ?? ""}
              onChange={(e) => setAddress({ ...effectiveAddress, address: e.target.value })}
              placeholder="Street address"
            />
            <Input
              value={effectiveAddress.city ?? ""}
              onChange={(e) => setAddress({ ...effectiveAddress, city: e.target.value })}
              placeholder="City"
            />
            <Input
              value={effectiveAddress.plus_code ?? ""}
              onChange={(e) => setAddress({ ...effectiveAddress, plus_code: e.target.value })}
              placeholder="Plus code (for the map pin)"
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 justify-between sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={household.members.length > 0}
            onClick={() =>
              runOrToastError(async () => {
                await removeHousehold({ id: householdId })
                onClose()
              })
            }
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button
              disabled={!canSaveName}
              onClick={() =>
                runOrToastError(async () => {
                  if (address) {
                    const latLng = address.plus_code
                      ? await convertPlusCodeToLatLng(address.plus_code)
                      : null
                    await updateHousehold({
                      id: householdId,
                      ...address,
                      latitude: latLng?.lat,
                      longitude: latLng?.lng,
                    })
                  }
                  onClose()
                })
              }
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddMemberRow({
  member,
  onAdd,
}: {
  member: { _id?: string; id?: string; name: string }
  onAdd: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`Add ${member.name}`}
      className="w-full flex items-center justify-between p-2 text-left text-sm hover:bg-muted/50"
      onClick={onAdd}
    >
      {member.name}
      <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  )
}
