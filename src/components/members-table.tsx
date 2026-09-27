"use client"

import { useState } from "react"
import { ArrowUpDown, Phone, Tag, Users, Building2, Home, Eye, Edit, Trash2, SlidersHorizontal, Archive, RotateCcw } from "lucide-react"
import { useTerminology } from "@/hooks/use-terminology"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { MemberAvatar } from "@/components/ui/member-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MemberEditDialog } from "@/components/member-edit-dialog"
import { MemberProfileDialog } from "@/components/member-profile-dialog"
import { BulkLabelDialog } from "@/components/bulk-label-manager"
import { BulkAddToUnitDialog } from "@/components/bulk-add-to-unit-dialog"
import { BulkAddToHouseholdDialog } from "@/components/bulk-add-to-household-dialog"
import { BulkStatusDialog } from "@/components/bulk-status-dialog"
import { MemberLabels } from "@/components/label-selector"
import { Member } from "@/types/database"
import type { Label } from "@/types/database"

interface MembersTableProps {
  members: Member[];
  onMemberUpdate?: () => void;
  isArchivedView?: boolean;
  /**
   * Selection lives in the parent so it survives the table unmounting while
   * "Load more" refetches, and so the share dialog in the page header can see
   * what's checked.
   */
  selectedMembers: string[];
  onSelectedMembersChange: (ids: string[]) => void;
  /**
   * Sorting runs on the server across the whole filtered list (members.listPage),
   * so a sorted directory is right before every page is loaded. The table
   * shows `members` in the order given and reports header clicks.
   */
  sort: MemberSort;
  onSortChange: (sort: MemberSort) => void;
}

export type MemberSortColumn = "name" | "status" | "joined_date" | "last_attendance" | "score";
export type MemberSort = { column: MemberSortColumn; direction: "asc" | "desc" };

import { useMutation, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useToast } from "@/hooks/use-toast"
import { useOrganization } from "@/hooks/use-organization"
import { formatDay as formatDisplayDay } from '@/lib/display'

/** "26 Sep 2026", or null when there is no date. */
function formatDay(value?: string | null): string | null {
  return value ? formatDisplayDay(value) : null
}

export function MembersTable({
  members,
  onMemberUpdate,
  isArchivedView = false,
  selectedMembers,
  onSelectedMembersChange,
  sort,
  onSortChange,
}: MembersTableProps) {
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [viewingMember, setViewingMember] = useState<Member | null>(null);
  const [memberToArchive, setMemberToArchive] = useState<Member | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const [showBulkLabels, setShowBulkLabels] = useState(false);
  const [visibleCols, setVisibleCols] = useState({
    contact: true,
    address: true,
    units: true,
    labels: true,
    lastAttendance: true,
    household: true,
    score: true,
  });
  const { terminology } = useTerminology()
  const { toast } = useToast()
  const { organization } = useOrganization()

  const households = useQuery(
    api.households.list,
    organization ? { organization_id: organization._id } : "skip",
  )
  const householdNameById = new Map(
    (households ?? []).map((h) => [h._id as string, h.name || "Unnamed household"]),
  )

  const deleteMember = useMutation(api.members.remove);
  const archiveMember = useMutation(api.members.archive);
  const restoreMember = useMutation(api.members.restore);

  const handleArchive = async (member: Member) => {
    try {
      await archiveMember({ id: member.id as any });
      toast({ title: "Member archived", description: `${member.name} is hidden from active lists. Restore them from the Archived tab.` });
      onMemberUpdate?.();
    } catch (error: any) {
      toast({
        title: "Couldn't archive the member",
        description: error?.message || "Something went wrong. Try again.",
        variant: "destructive",
      });
    } finally {
      setMemberToArchive(null);
    }
  };

  const handleRestore = async (member: Member) => {
    try {
      await restoreMember({ id: member.id as any });
      toast({ title: "Member restored", description: `${member.name} is active again.` });
      onMemberUpdate?.();
    } catch (error: any) {
      toast({
        title: "Couldn't restore the member",
        description: error?.message || "Something went wrong. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeletePermanently = async (member: Member) => {
    try {
      await deleteMember({ id: member.id as any });
      toast({ title: "Member deleted", description: `${member.name} and their records have been removed.` });
      onMemberUpdate?.();
    } catch (error: any) {
      toast({
        title: "Couldn't delete the member",
        description: error?.message || "Something went wrong. Try again.",
        variant: "destructive",
      });
    } finally {
      setMemberToDelete(null);
    }
  };

  // "Select all" acts on the rows currently loaded: checking it selects every
  // loaded row, unchecking clears only those, leaving any selection carried
  // over from earlier pages intact.
  const loadedIds = members.map((member) => member.id || '');
  const allLoadedSelected =
    loadedIds.length > 0 && loadedIds.every((id) => selectedMembers.includes(id));

  const handleSelectAll = () => {
    if (allLoadedSelected) {
      const loaded = new Set(loadedIds);
      onSelectedMembersChange(selectedMembers.filter((id) => !loaded.has(id)));
    } else {
      onSelectedMembersChange(Array.from(new Set([...selectedMembers, ...loadedIds])));
    }
  };

  const handleSelectMember = (id: string) => {
    if (selectedMembers.includes(id)) {
      onSelectedMembersChange(selectedMembers.filter((memberId) => memberId !== id));
    } else {
      onSelectedMembersChange([...selectedMembers, id]);
    }
  };

  const handleSort = (column: MemberSortColumn) => {
    if (sort.column === column) {
      onSortChange({ column, direction: sort.direction === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ column, direction: "asc" });
    }
  };

  const ariaSort = (column: MemberSortColumn) =>
    sort.column === column ? (sort.direction === "asc" ? "ascending" : "descending") : undefined;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-success/15 text-success-strong">Active</Badge>;
      case "inactive":
        return <Badge className="bg-warning/15 text-warning-strong">Inactive</Badge>;
      case "visitor":
        return <Badge className="bg-info/15 text-info-strong">Visitor</Badge>;
      default:
        return null;
    }
  };

  const getRiskBadge = (level?: string) => {
    switch (level) {
      case "low":
        return <Badge className="bg-success/15 text-success-strong">Low risk</Badge>;
      case "medium":
        return <Badge className="bg-warning/15 text-warning-strong">Medium risk</Badge>;
      case "high":
        return <Badge className="bg-destructive/15 text-destructive-strong">High risk</Badge>;
      case "new":
        return <Badge className="bg-muted text-muted-foreground">New member</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Bulk Actions Bar */}
      {selectedMembers.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium text-foreground">
            {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <BulkLabelDialog
              selectedMembers={members.filter((m: any) => selectedMembers.includes(m.id || ''))}
              trigger={
                <Button variant="outline" size="sm" className="gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  Labels
                </Button>
              }
            />
            <BulkAddToUnitDialog
              selectedMembers={members.filter((m: any) => selectedMembers.includes(m.id || ''))}
              trigger={
                <Button variant="outline" size="sm" className="gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Add to unit
                </Button>
              }
              onSuccess={() => {
                onSelectedMembersChange([]);
                onMemberUpdate?.();
              }}
            />
            <BulkAddToHouseholdDialog
              selectedMembers={members.filter((m: any) => selectedMembers.includes(m.id || ''))}
              trigger={
                <Button variant="outline" size="sm" className="gap-2">
                  <Home className="h-4 w-4 text-muted-foreground" />
                  Add to household
                </Button>
              }
              onSuccess={() => {
                onSelectedMembersChange([]);
                onMemberUpdate?.();
              }}
            />
            <BulkStatusDialog
              selectedMembers={members.filter((m: any) => selectedMembers.includes(m.id || ''))}
              trigger={
                <Button variant="outline" size="sm" className="gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Set status
                </Button>
              }
              onSuccess={() => {
                onSelectedMembersChange([]);
                onMemberUpdate?.();
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelectedMembersChange([])}
              className="text-muted-foreground"
            >
              Clear selection
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {([
              ["contact", "Contact"],
              ["address", "Address"],
              ["household", "Household"],
              ["units", "Units"],
              ["labels", "Labels"],
              ["lastAttendance", "Last attendance"],
              ["score", "Engagement score"],
            ] as const).map(([key, label]) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={visibleCols[key]}
                onCheckedChange={(v) => setVisibleCols((prev) => ({ ...prev, [key]: !!v }))}
                onSelect={(e) => e.preventDefault()}
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow className="bg-muted hover:bg-muted [&>th]:whitespace-nowrap">
              <TableHead className="w-12">
                <Checkbox
                  checked={allLoadedSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all members"
                />
              </TableHead>
              <TableHead className="min-w-48" aria-sort={ariaSort("name")}>
                <div className="flex cursor-pointer items-center gap-2" onClick={() => handleSort("name")}>
                  <span className="font-medium">Name</span>
                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </TableHead>
              {visibleCols.contact && <TableHead className="hidden md:table-cell">Contact</TableHead>}
              {visibleCols.address && <TableHead className="hidden md:table-cell">Address</TableHead>}
              {visibleCols.household && <TableHead className="hidden md:table-cell">Household</TableHead>}
              <TableHead className="hidden md:table-cell" aria-sort={ariaSort("status")}>
                <div className="flex cursor-pointer items-center gap-2" onClick={() => handleSort("status")}>
                  <span className="font-medium">Status</span>
                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </TableHead>
              {visibleCols.units && (
                <TableHead className="hidden md:table-cell">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Units</span>
                  </div>
                </TableHead>
              )}
              {visibleCols.labels && (
                <TableHead className="hidden xl:table-cell">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Labels</span>
                  </div>
                </TableHead>
              )}
              {visibleCols.lastAttendance && (
                <TableHead className="hidden lg:table-cell" aria-sort={ariaSort("last_attendance")}>
                  <div className="flex cursor-pointer items-center gap-2" onClick={() => handleSort("last_attendance")}>
                    <span className="font-medium">Last attendance</span>
                    <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </TableHead>
              )}
              {visibleCols.score && (
                <TableHead className="hidden lg:table-cell" aria-sort={ariaSort("score")}>
                  <div className="flex cursor-pointer items-center gap-2" onClick={() => handleSort("score")}>
                    <span className="font-medium">Engagement</span>
                    <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </TableHead>
              )}
              <TableHead className="sticky right-0 z-20 w-32 min-w-32 border-l border-border bg-muted text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id} className="group hover:bg-muted/50 transition-colors border-border last:border-0">
                <TableCell>
                  <Checkbox
                    checked={selectedMembers.includes(member.id || '')}
                    onCheckedChange={() => handleSelectMember(member.id || '')}
                    aria-label={`Select ${member.name}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <MemberAvatar name={member.name} src={member.avatar_url || member.avatar} className="ring-2 ring-primary/20" />
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="font-medium truncate">{member.name}</div>
                      {/* Phone + status only shown here on mobile: the
                          Status column is hidden below md, and Contact is
                          hidden below md too, so this is the only place
                          either is visible on a small screen. */}
                      <div className="flex items-center gap-2 md:hidden">
                        <span className="text-xs text-muted-foreground truncate">{member.phone || 'No phone'}</span>
                        {getStatusBadge(member.status)}
                      </div>
                    </div>
                  </div>
                </TableCell>
                {visibleCols.contact && (
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Phone className="mr-1 h-3 w-3" />
                      <span>{member.phone || 'No phone'}</span>
                    </div>
                  </TableCell>
                )}
                {visibleCols.address && (
                  <TableCell className="hidden md:table-cell max-w-[160px] truncate text-sm text-muted-foreground">
                    {member.address || member.city || <span className="text-muted-foreground/70">No address</span>}
                  </TableCell>
                )}
                {visibleCols.household && (
                  <TableCell className="hidden md:table-cell">
                    {member.household_id ? (
                      <Badge variant="outline" className="font-normal">
                        {householdNameById.get(member.household_id as string) ?? "Household"}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">Not in a household</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="hidden md:table-cell">{getStatusBadge(member.status)}</TableCell>
                {visibleCols.units && (
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {((member as any).unit_names || []).length > 0 ? (
                        ((member as any).unit_names || []).map((unitName: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="font-normal">
                            {unitName}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-sm">No units</span>
                      )}
                    </div>
                  </TableCell>
                )}
                {visibleCols.labels && (
                  <TableCell className="hidden xl:table-cell">
                    <MemberLabels labels={(member as any).labels || []} />
                  </TableCell>
                )}
                {visibleCols.lastAttendance && (
                  <TableCell className="hidden lg:table-cell whitespace-nowrap">
                    {formatDay(member.last_attendance) ?? <span className="text-muted-foreground">No record</span>}
                  </TableCell>
                )}
                {visibleCols.score && (
                  <TableCell className="hidden lg:table-cell">
                    {member.engagement_score !== undefined ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{member.engagement_score}</span>
                        {getRiskBadge(member.engagement_risk_level)}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Not scored</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="sticky right-0 z-10 w-32 min-w-32 border-l border-border bg-card group-hover:bg-muted">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setViewingMember(member)}
                    >
                      <Eye className="h-4 w-4" />
                      <span className="sr-only">View</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditingMember(member)}
                    >
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    {isArchivedView ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleRestore(member)}
                        >
                          <RotateCcw className="h-4 w-4" />
                          <span className="sr-only">Restore</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setMemberToDelete(member)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete permanently</span>
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setMemberToArchive(member)}
                      >
                        <Archive className="h-4 w-4" />
                        <span className="sr-only">Archive</span>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {editingMember && (
          <MemberEditDialog
            member={editingMember}
            open={!!editingMember}
            onOpenChange={(open) => !open && setEditingMember(null)}
            onSuccess={() => {
              // Keep the dialog open after successful edit.
              // setEditingMember(null); // Removed this line

              // Trigger refresh of members list
              if (onMemberUpdate) {
                onMemberUpdate();
              }
            }}
          />
        )}

        {viewingMember && (
          <MemberProfileDialog
            member={viewingMember}
            open={!!viewingMember}
            onOpenChange={(open) => !open && setViewingMember(null)}
          />
        )}

        <AlertDialog open={!!memberToArchive} onOpenChange={(open) => !open && setMemberToArchive(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive {memberToArchive?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                They'll be hidden from active lists and pickers, but their attendance and history are
                kept. You can restore them at any time from the Archived tab.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => memberToArchive && handleArchive(memberToArchive)}>
                Archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!memberToDelete} onOpenChange={(open) => !open && setMemberToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Permanently delete {memberToDelete?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This can't be undone. Their attendance records, unit assignments and labels will be erased.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => memberToDelete && handleDeletePermanently(memberToDelete)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
