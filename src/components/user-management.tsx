'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Users, Edit, UserPlus, Trash2, UserX, UserCheck } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { useUserRole } from '@/hooks/use-user-role'
import { useOrganization } from "@/hooks/use-organization"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useTerminology } from '@/hooks/use-terminology'
import { LeaderInvitationSystem } from '@/components/leader-invitation-system'
import type { UserRole } from '@/types/database'
import { Id } from "../../convex/_generated/dataModel"
import { PageHeader } from "@/components/ui/page-header"
import { formatDay } from "@/lib/display"
import { NoAccess } from "@/components/ui/no-access"
import { LoadingState } from "@/components/ui/loading-state"

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super admin',
  organization_admin: 'Organization admin',
  division_admin: 'Division admin',
  unit_admin: 'Unit admin',
  member: 'Member',
}

/** "organization_admin" reads "Organization admin"; unknown roles fall back to sentence case. */
function roleLabel(role: string | undefined): string {
  if (!role) return 'Member'
  if (ROLE_LABELS[role]) return ROLE_LABELS[role]
  const words = role.replace(/[_.-]+/g, ' ').trim().toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const ROLE_TONES: Record<string, string> = {
  super_admin: 'bg-primary/15 text-primary',
  organization_admin: 'bg-info/15 text-info-strong',
  division_admin: 'bg-warning/15 text-warning-strong',
  unit_admin: 'bg-success/15 text-success-strong',
  member: 'bg-muted text-muted-foreground',
}

export function UserManagement() {
  const { isAdmin, user: currentUser, isLoading: roleLoading } = useUserRole()
  const { toast } = useToast()
  const { terminology } = useTerminology()
  const { organization } = useOrganization()
  const [activeTab, setActiveTab] = useState<'users' | 'invitations'>('users')

  const usersData = useQuery(api.users.list);

  // Use units.listByOrg with the active organization, same as Invite Leaders tab
  const unitsData = useQuery(
    api.units.listByOrg,
    organization?._id ? { organization_id: organization._id } : "skip"
  );
  const membersData = useQuery(
    api.members.getAll,
    organization?._id ? { organization_id: organization._id } : "skip"
  );
  // Unit-admin assignments (leader + co-admins), the source of truth for access.
  const unitAdminsData = useQuery(
    api.unit_admins.listByOrg,
    organization?._id ? { organization_id: organization._id } : "skip"
  );

  const updateRole = useMutation(api.users.updateRole);
  const addUnitAdmin = useMutation(api.unit_admins.addAdmin);
  const removeUnitAdmin = useMutation(api.unit_admins.removeAdmin);
  const setUserActive = useMutation(api.users.setActive);
  const removeUser = useMutation(api.users.remove);

  const users = (usersData || []) as any[];
  const allUnits = (unitsData || []).map((m: any) => ({ ...m, id: m._id }));
  const members = (membersData || []).map((m: any) => ({ ...m, id: m._id }));

  const isLoading = usersData === undefined || unitsData === undefined;

  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [editingUser, setEditingUser] = useState<any | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [userToRemove, setUserToRemove] = useState<any | null>(null)

  // Form state for editing user
  const [selectedRole, setSelectedRole] = useState<UserRole>('member')
  const [selectedUnits, setSelectedUnits] = useState<string[]>([])

  const [originalUnits, setOriginalUnits] = useState<string[]>([]);
  const [editingMemberId, setEditingMemberId] = useState<Id<"members"> | null>(null);

  // Units the member being edited currently administers (primary or assistant).
  const editingMemberAdminUnits = useQuery(
    api.unit_admins.listByMember,
    editingMemberId ? { member_id: editingMemberId } : "skip"
  );

  // Populate the unit selection once the member's admin units load.
  useEffect(() => {
    if (!isDialogOpen || !editingMemberId) return;
    if (editingMemberAdminUnits === undefined) return;
    const unitIds = editingMemberAdminUnits.map((r: any) => r.unit_id as string);
    setSelectedUnits(unitIds);
    setOriginalUnits(unitIds);
  }, [editingMemberAdminUnits, isDialogOpen, editingMemberId]);

  const handleEditUser = (user: any) => {
    setEditingUser(user)
    setSelectedRole(user.role as UserRole)

    // Find member by user_id foreign key
    const member = members.find(m => m.user_id === user._id)
    const memberId = member?._id

    // Reset selection; the effect above fills it in once the member's admin
    // units load from unit_admins (covers primary + assistant admin roles).
    setSelectedUnits([])
    setOriginalUnits([])
    setEditingMemberId((memberId as Id<"members">) || null)

    setIsDialogOpen(true)
  }

  const handleSaveUser = async () => {
    if (!editingUser) return

    try {
      // Update user role
      await updateRole({ id: editingUser._id, role: selectedRole })

      // Find member by user_id foreign key
      const member = members.find(m => m.user_id === editingUser._id)
      const memberId = member?._id

      if (memberId) {
        const memberIdTyped = memberId as Id<"members">
        // Grant/revoke unit admin access (additive — does not displace other
        // admins). New admins become primary leader only if the unit has none.
        const addedUnits = selectedUnits.filter(id => !originalUnits.includes(id))
        for (const uId of addedUnits) {
          await addUnitAdmin({ unit_id: uId as Id<"units">, member_id: memberIdTyped })
        }

        const removedUnits = originalUnits.filter(id => !selectedUnits.includes(id))
        for (const uId of removedUnits) {
          await removeUnitAdmin({ unit_id: uId as Id<"units">, member_id: memberIdTyped })
        }
      }

      setIsDialogOpen(false)
      setEditingUser(null)
      setEditingMemberId(null)
      toast({ title: 'Changes saved' })
    } catch (error) {
      console.error('Error saving user:', error)
      toast({ title: "Couldn't save the changes", description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    }
  }

  const filteredUsers = (users || []).filter((user) => {
    const matchesSearch =
      searchQuery === '' ||
      (user.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.email || '').toLowerCase().includes(searchQuery.toLowerCase())

    const matchesRole = roleFilter === 'all' || user.role === roleFilter

    return matchesSearch && matchesRole
  })

  // Whether a user account is linked to a member profile.
  const hasProfile = (user: any) => members.some(m => m.user_id === user._id)

  // Org admins can't modify themselves or super admins (only a super admin can).
  const canModifyUser = (user: any) =>
    user._id !== currentUser?._id &&
    (currentUser?.role === 'super_admin' || user.role !== 'super_admin')

  const handleToggleActive = async (user: any) => {
    try {
      await setUserActive({ id: user._id, active: !user.active })
      toast({ title: user.active ? 'Account deactivated' : 'Account reactivated' })
    } catch (error: any) {
      toast({ title: "Couldn't change the account", description: error.message, variant: 'destructive' })
    }
  }

  const handleConfirmRemove = async () => {
    if (!userToRemove) return
    try {
      await removeUser({ id: userToRemove._id })
      toast({ title: 'Account removed', description: 'Their member profile was kept.' })
    } catch (error: any) {
      toast({ title: "Couldn't remove the account", description: error.message, variant: 'destructive' })
    } finally {
      setUserToRemove(null)
    }
  }

  // Units a user administers, sourced from unit_admins (leader + co-admins) so
  // it matches the access they actually get — not just units they primarily lead.
  const getLeaderUnitsForUser = (user: any) => {
    const member = members.find(m => m.user_id === user._id)
    if (!member) return []
    const adminUnitIds = new Set(
      (unitAdminsData || [])
        .filter((r: any) => r.member_id === member._id)
        .map((r: any) => r.unit_id as string)
    )
    // Include legacy leader_id-led units too, so pre-backfill leaders aren't missed.
    return allUnits.filter((u: any) => adminUnitIds.has(u._id) || u.leader_id === member._id)
  }

  if (roleLoading) return <LoadingState message="Checking your access…" />
    if (!isAdmin) {
    return <NoAccess what="manage users and roles" who="administrators" />
  }

  return (
    <div className="container p-4 md:p-6">
      <PageHeader
        className="mb-6"
        title="User management"
        description="Who can sign in, their roles, and leader invitations."
      />

      {/* Tab Navigation */}
      <div className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
        <Button
          variant={activeTab === 'users' ? 'default' : 'outline'}
          onClick={() => setActiveTab('users')}
          className="flex shrink-0 items-center gap-2"
        >
          <Users className="h-4 w-4" />
          Users
        </Button>
        <Button
          variant={activeTab === 'invitations' ? 'default' : 'outline'}
          onClick={() => setActiveTab('invitations')}
          className="flex shrink-0 items-center gap-2"
        >
          <UserPlus className="h-4 w-4" />
          Invite leaders
        </Button>
      </div>

      {/* Tab Content */}
      {activeTab === 'users' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">People who can sign in</CardTitle>
            <CardDescription>
              Change what each person can see and do, or turn off their access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="flex-1">
                <Input
                  placeholder="Search by name or email…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="super_admin">Super admin</SelectItem>
                  <SelectItem value="organization_admin">Organization admin</SelectItem>
                  <SelectItem value="division_admin">Division admin</SelectItem>
                  <SelectItem value="unit_admin">Unit admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Users Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Units</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2"></div>
                          Loading people…
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-24 text-center text-muted-foreground"
                      >
                        {searchQuery || roleFilter !== 'all' ? 'No one matches your search.' : 'No one can sign in yet.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      (() => {
                        const leaderUnits = getLeaderUnitsForUser(user)
                        return (
                      <TableRow key={user._id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{user.name || user.email || 'Unnamed account'}</span>
                            {!hasProfile(user) && (
                              <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                                No member profile
                              </Badge>
                            )}
                          </div>
                          {user.email && user.name && (
                            <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={ROLE_TONES[user.role] ?? ROLE_TONES.member}>
                            {roleLabel(user.role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {leaderUnits.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {leaderUnits.map((unit: any) => (
                                <Badge key={unit._id} variant="outline" className="text-xs">
                                  {unit.name}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={user.active ? 'bg-success/15 text-success-strong' : 'bg-muted text-muted-foreground'}
                          >
                            {user.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user._creationTime ? formatDay(user._creationTime) : <span className="text-muted-foreground">Unknown</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditUser(user)}
                              title="Edit role"
                              aria-label={`Edit role for ${user.name || user.email || 'this account'}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleActive(user)}
                              disabled={!canModifyUser(user)}
                              title={user.active ? 'Deactivate account' : 'Reactivate account'}
                              aria-label={user.active ? 'Deactivate account' : 'Reactivate account'}
                            >
                              {user.active ? (
                                <UserX className="h-4 w-4" />
                              ) : (
                                <UserCheck className="h-4 w-4 text-success-strong" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setUserToRemove(user)}
                              disabled={!canModifyUser(user)}
                              title="Remove account"
                              aria-label="Remove account"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                        )
                      })()
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>

          {/* Remove User Confirmation */}
          <AlertDialog open={!!userToRemove} onOpenChange={(open) => { if (!open) setUserToRemove(null) }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this user account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes <span className="font-medium">{userToRemove?.name || userToRemove?.email}</span>'s
                  account and their app access. Their member profile (if any) is kept and simply unlinked. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmRemove}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Edit User Dialog */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Edit role</DialogTitle>
                <DialogDescription>
                  Choose what {editingUser?.name || editingUser?.email || 'this person'} can see and do.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={selectedRole}
                    onValueChange={(value: UserRole) => setSelectedRole(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="unit_admin">Unit admin</SelectItem>
                      <SelectItem value="division_admin">Division admin</SelectItem>
                      <SelectItem value="organization_admin">Organization admin</SelectItem>
                      <SelectItem value="super_admin">Super admin</SelectItem>

                    </SelectContent>
                  </Select>
                </div>

                {(selectedRole === 'organization_admin' ||
                  selectedRole === 'division_admin' ||
                  selectedRole === 'unit_admin') && (
                    <div>
                      <Label>Units they lead</Label>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {allUnits.map((unit: any) => (
                          <div
                            key={unit._id}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={unit._id}
                              checked={selectedUnits.includes(unit._id)}
                              onCheckedChange={(checked: boolean | "indeterminate") => {
                                if (checked) {
                                  setSelectedUnits([
                                    ...selectedUnits,
                                    unit._id,
                                  ])
                                } else {
                                  setSelectedUnits(
                                    selectedUnits.filter(
                                      (id) => id !== unit._id
                                    )
                                  )
                                }
                              }}
                            />
                            <Label htmlFor={unit._id} className="text-sm">
                              {unit.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSaveUser}>Save changes</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </Card>
      ) : (
        <LeaderInvitationSystem />
      )}
    </div>
  )
}
