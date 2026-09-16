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

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
}

import { useMutation, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useToast } from "@/hooks/use-toast"
import { useOrganization } from "@/hooks/use-organization"

export function MembersTable({
  members,
  onMemberUpdate,
  isArchivedView = false,
  selectedMembers,
  onSelectedMembersChange,
}: MembersTableProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
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
      toast({ title: "Member archived", description: `${member.name} has been archived.` });
      onMemberUpdate?.();
    } catch (error: any) {
      toast({
        title: "Failed to archive member",
        description: error?.message || "Something went wrong. Please try again.",
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
        title: "Failed to restore member",
        description: error?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeletePermanently = async (member: Member) => {
    try {
      await deleteMember({ id: member.id as any });
      toast({ title: "Member permanently deleted" });
      onMemberUpdate?.();
    } catch (error: any) {
      toast({
        title: "Failed to delete member",
        description: error?.message || "Something went wrong. Please try again.",
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

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortedMembers = () => {
    if (!sortColumn) return members;

    return [...members].sort((a, b) => {
      let valueA, valueB;

      switch (sortColumn) {
        case "name":
          valueA = a.name;
          valueB = b.name;
          break;
        case "status":
          valueA = a.status;
          valueB = b.status;
          break;
        case "joined_date":
          valueA = new Date(a.joined_date);
          valueB = new Date(b.joined_date);
          break;
        case "last_attendance":
          valueA = new Date(a.last_attendance);
          valueB = new Date(b.last_attendance);
          break;
        case "score":
          valueA = a.engagement_score ?? -1;
          valueB = b.engagement_score ?? -1;
          break;
        default:
          return 0;
      }

      if (valueA < valueB) return sortDirection === "asc" ? -1 : 1;
      if (valueA > valueB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500">Active</Badge>;
      case "inactive":
        return (
          <Badge variant="outline" className="text-amber-500 border-amber-500">
            Inactive
          </Badge>
        );
      case "visitor":
        return <Badge variant="secondary">Visitor</Badge>;
      default:
        return null;
    }
  };

  const getRiskBadge = (level?: string) => {
    switch (level) {
      case "low":
        return <Badge className="bg-green-500 text-[10px]">Low</Badge>;
      case "medium":
        return (
          <Badge variant="outline" className="text-amber-500 border-amber-500 text-[10px]">
            Medium
          </Badge>
        );
      case "high":
        return <Badge variant="destructive" className="text-[10px]">High</Badge>;
      case "new":
        return <Badge variant="secondary" className="text-[10px]">New</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Bulk Actions Bar */}
      {selectedMembers.length > 0 && (
        <div className="flex items-center justify-between p-4 bg-white dark:bg-card border-4 border-black dark:border-white rounded-lg shadow-brutal">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/50">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-sm text-blue-900 dark:text-blue-100">
              {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <BulkLabelDialog
              selectedMembers={members.filter((m: any) => selectedMembers.includes(m.id || ''))}
              trigger={
                <Button variant="outline" size="sm" className="gap-2 border-blue-300 hover:bg-blue-100 dark:border-blue-700 dark:hover:bg-blue-900/50">
                  <Tag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Manage Labels
                </Button>
              }
            />
            <BulkAddToUnitDialog
              selectedMembers={members.filter((m: any) => selectedMembers.includes(m.id || ''))}
              trigger={
                <Button variant="outline" size="sm" className="gap-2 border-blue-300 hover:bg-blue-100 dark:border-blue-700 dark:hover:bg-blue-900/50">
                  <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Add to Unit
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
                <Button variant="outline" size="sm" className="gap-2 border-blue-300 hover:bg-blue-100 dark:border-blue-700 dark:hover:bg-blue-900/50">
                  <Home className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Add to Household
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
                <Button variant="outline" size="sm" className="gap-2 border-blue-300 hover:bg-blue-100 dark:border-blue-700 dark:hover:bg-blue-900/50">
                  <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Set Status
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
              className="text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
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
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
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

      <div className="rounded-xl border overflow-x-auto shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={allLoadedSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all members"
                />
              </TableHead>
              <TableHead className="min-w-[180px]">
                <div className="flex items-center space-x-2 cursor-pointer" onClick={() => handleSort("name")}>
                  <span className="font-bold">Name</span>
                  <ArrowUpDown className="h-4 w-4" />
                </div>
              </TableHead>
              {visibleCols.contact && <TableHead className="hidden md:table-cell">Contact</TableHead>}
              {visibleCols.address && <TableHead className="hidden md:table-cell">Address</TableHead>}
              {visibleCols.household && <TableHead className="hidden md:table-cell">Household</TableHead>}
              <TableHead className="hidden md:table-cell">
                <div className="flex items-center space-x-2 cursor-pointer" onClick={() => handleSort("status")}>
                  <span className="font-bold">Status</span>
                  <ArrowUpDown className="h-4 w-4" />
                </div>
              </TableHead>
              {visibleCols.units && (
                <TableHead className="hidden md:table-cell">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span className="font-bold">Units</span>
                  </div>
                </TableHead>
              )}
              {visibleCols.labels && (
                <TableHead className="hidden xl:table-cell">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    <span className="font-bold">Labels</span>
                  </div>
                </TableHead>
              )}
              {visibleCols.lastAttendance && (
                <TableHead className="hidden lg:table-cell">
                  <div className="flex items-center space-x-2 cursor-pointer" onClick={() => handleSort("last_attendance")}>
                    <span className="font-bold whitespace-nowrap">Last Attendance</span>
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </TableHead>
              )}
              {visibleCols.score && (
                <TableHead className="hidden lg:table-cell">
                  <div className="flex items-center space-x-2 cursor-pointer" onClick={() => handleSort("score")}>
                    <span className="font-bold whitespace-nowrap">Engagement</span>
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </TableHead>
              )}
              <TableHead className="sticky right-0 z-20 bg-muted/30 text-right w-[120px] shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.1)]">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {getSortedMembers().map((member) => (
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
                    <Avatar className="ring-2 ring-primary/20">
                      <AvatarImage src={member.avatar_url || member.avatar} alt={member.name} />
                      <AvatarFallback className="bg-muted text-foreground font-semibold text-sm border border-border/50">{member.initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="font-bold truncate">{member.name}</div>
                      {/* Phone + status only shown here on mobile — the
                          Status column is hidden below md, and Contact is
                          hidden below md too, so this is the only place
                          either is visible on a small screen. */}
                      <div className="flex items-center gap-2 md:hidden">
                        <span className="text-xs text-muted-foreground truncate">{member.phone || '—'}</span>
                        {getStatusBadge(member.status)}
                      </div>
                    </div>
                  </div>
                </TableCell>
                {visibleCols.contact && (
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Phone className="mr-1 h-3 w-3" />
                      <span>{member.phone || '—'}</span>
                    </div>
                  </TableCell>
                )}
                {visibleCols.address && (
                  <TableCell className="hidden md:table-cell max-w-[160px] truncate text-sm text-muted-foreground">
                    {member.address || member.city || '—'}
                  </TableCell>
                )}
                {visibleCols.household && (
                  <TableCell className="hidden md:table-cell">
                    {member.household_id ? (
                      <Badge variant="outline" className="text-xs">
                        {householdNameById.get(member.household_id as string) ?? "Household"}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground/60">Not in a household</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="hidden md:table-cell">{getStatusBadge(member.status)}</TableCell>
                {visibleCols.units && (
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {((member as any).unit_names || []).length > 0 ? (
                        ((member as any).unit_names || []).map((unitName: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {unitName}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
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
                  <TableCell className="hidden lg:table-cell font-medium">{member.last_attendance}</TableCell>
                )}
                {visibleCols.score && (
                  <TableCell className="hidden lg:table-cell">
                    {member.engagement_score !== undefined ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{member.engagement_score}</span>
                        {getRiskBadge(member.engagement_risk_level)}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="sticky right-0 z-10 bg-card group-hover:bg-muted/50 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.1)]">
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
                preserved. You can restore them anytime from the Archived tab.
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
                This cannot be undone. Their attendance records, unit assignments, and labels will be erased.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => memberToDelete && handleDeletePermanently(memberToDelete)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
