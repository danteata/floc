'use client'

import { useState } from 'react'
import { formatDay } from "@/lib/display"
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
import { useOrganization } from "@/hooks/use-organization"
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
import {
  UserPlus,
  Mail,
  Send,
  CheckCircle,
  AlertCircle,
  Link,
  Copy,
  Search,
  Users,
  Loader2,
  XCircle
} from 'lucide-react'
import { useTerminology } from '@/hooks/use-terminology'
import { useToast } from '@/hooks/use-toast'
import { useQuery, useMutation } from 'convex/react'
import { useAnalytics } from '@/hooks/useAnalytics'
import { AnalyticsEventType } from '@/services/analytics/types'
import { api } from '../../convex/_generated/api'
import { Checkbox } from '@/components/ui/checkbox'
import { Id } from '../../convex/_generated/dataModel'

interface PotentialLeader {
  id: string
  clerk_user_id?: string
  name: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  unit_names: string[]
  has_account: boolean
  invitation_status: string | null
  led_unit_ids: string[]
  led_unit_names: string[]
}

/** "organization_admin" reads "Organization admin". */
function inviteRoleLabel(role: string | undefined): string {
  if (!role) return 'Member'
  const words = role.replace(/[_.-]+/g, ' ').trim().toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function LeaderInvitationSystem() {
  const { terminology } = useTerminology()
  const { toast } = useToast()
  const { organization, context } = useOrganization()

  // Get current user to check if super_admin
  const currentUser = useQuery(api.users.current);
  const isSuperAdmin = currentUser?.role === "super_admin";
  const isOrgAdmin = currentUser?.role === "organization_admin" || currentUser?.role === "admin";

  // For super_admins, get all organizations and allow selection
  const allOrganizations = useQuery(api.organizations.list, isSuperAdmin ? undefined : "skip");
  const [selectedOrgId, setSelectedOrgId] = useState<Id<"organizations"> | null>(null);

  // Use selected org for super_admins, otherwise use the context organization
  const activeOrganization = isSuperAdmin
    ? allOrganizations?.find(o => o._id === selectedOrgId) || allOrganizations?.[0]
    : organization;
  const { trackEvent } = useAnalytics()

  // Convex Queries
  const members = useQuery(
    api.members.getAll,
    activeOrganization?._id ? { organization_id: activeOrganization._id } : "skip"
  ) || []
  const unitsData = useQuery(
    api.units.listByOrg,
    activeOrganization?._id ? { organization_id: activeOrganization._id } : "skip"
  );
  const allUnits = unitsData || [];
  const users = useQuery(api.users.list) || []
  const invitations = useQuery(
    api.invitations.list,
    activeOrganization?._id ? { organization_id: activeOrganization._id } : "skip"
  ) || []
  const scopedUsers = activeOrganization?._id
    ? users.filter((u: any) => u.organization_id === activeOrganization._id)
    : users;

  // Convex Mutations
  const createInvitation = useMutation(api.invitations.create)
  const revokeInvitation = useMutation(api.invitations.revoke)

  const handleRevokeInvitation = async (id: string) => {
    try {
      await revokeInvitation({ id: id as Id<"invitations"> })
      toast({ title: "Invitation revoked", description: "The invitation link can no longer be used." })
    } catch (err: any) {
      toast({ title: "Couldn't revoke the invitation", description: err.message, variant: "destructive" })
    }
  }

  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [selectedLeaders, setSelectedLeaders] = useState<string[]>([])
  const [isSendingInvites, setIsSendingInvites] = useState(false)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [isInviteLinkDialogOpen, setIsInviteLinkDialogOpen] = useState(false)
  const [isAdminInviteDialogOpen, setIsAdminInviteDialogOpen] = useState(false)
  const [adminInviteMode, setAdminInviteMode] = useState<'new' | 'existing'>('new')
  const [adminInviteForm, setAdminInviteForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  })
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [memberSearchQuery, setMemberSearchQuery] = useState('')

  // New state for member leader invitation
  const [isLeaderInviteDialogOpen, setIsLeaderInviteDialogOpen] = useState(false)
  const [selectedMemberForLeader, setSelectedMemberForLeader] = useState<string | null>(null)
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([])
  const [leaderMemberSearchQuery, setLeaderMemberSearchQuery] = useState('')
  const [unitSearchQuery, setUnitSearchQuery] = useState('')
  const [isCreatingLeaderInvite, setIsCreatingLeaderInvite] = useState(false)

  const isLoading = members.length === 0 && allUnits.length === 0;

  if (currentUser && !isSuperAdmin && !isOrgAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Invite leaders</CardTitle>
          <CardDescription>
            You don&apos;t have permission to invite leaders.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // Derive Potential Leaders from state
  const potentialLeaders: PotentialLeader[] = members
    .filter((member: any) => {
      // Check if member leads any unit
      const leadsUnit = allUnits.some((u: any) => u.leader_id === member._id);
      return leadsUnit;
    })
    .map((member: any) => {
      const ledUnits = allUnits.filter((u: any) => u.leader_id === member._id);
      const invitation = invitations.find((i: any) =>
        i.member_id === member._id || (member.email && i.email === member.email)
      );
      // "Has account" is determined by the canonical member -> user link, not by
      // email equality (members without an email would otherwise all match an
      // emailless account and be falsely flagged as registered).
      const hasAccount = member.user_id
        ? scopedUsers.some((u: any) => u._id === member.user_id) || users.some((u: any) => u._id === member.user_id)
        : false;

      return {
        id: member._id,
        name: member.name,
        first_name: member.first_name,
        last_name: member.last_name,
        email: member.email,
        phone: member.phone,
        unit_names: member.unit_names || [],
        has_account: hasAccount,
        invitation_status: invitation?.status || null,
        led_unit_ids: ledUnits.map((u: any) => u._id),
        led_unit_names: ledUnits.map((u: any) => u.name),
      };
    });

  const filteredLeaders = potentialLeaders.filter((leader) => {
    const matchesSearch =
      searchQuery === '' ||
      leader.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (leader.email
        ? leader.email.toLowerCase().includes(searchQuery.toLowerCase())
        : false)

    const matchesRole =
      roleFilter === 'all' ||
      (roleFilter === 'no_account' && !leader.has_account) ||
      (roleFilter === 'has_account' && leader.has_account) ||
      (roleFilter === 'unit_leader' &&
        leader.led_unit_names &&
        leader.led_unit_names.length > 0)

    return matchesSearch && matchesRole
  })

  // Pending invitations (awaiting acceptance) that can still be revoked.
  const unitNameById = new Map<string, string>(allUnits.map((u: any) => [u._id, u.name]))
  const pendingInvitations = (invitations as any[]).filter((i) => i.status === 'pending')

  const handleSelectLeader = (leaderId: string) => {
    if (selectedLeaders.includes(leaderId)) {
      setSelectedLeaders(selectedLeaders.filter((id) => id !== leaderId))
    } else {
      setSelectedLeaders([...selectedLeaders, leaderId])
    }
  }

  const handleSelectAll = () => {
    const eligibleLeaders = filteredLeaders.filter((l) => !l.has_account)
    if (selectedLeaders.length === eligibleLeaders.length) {
      setSelectedLeaders([])
    } else {
      setSelectedLeaders(eligibleLeaders.map((l) => l.id))
    }
  }

  const sendInvitations = async () => {
    setIsSendingInvites(true)
    try {
      for (const leaderId of selectedLeaders) {
        const leader = potentialLeaders.find(l => l.id === leaderId);
        if (!leader || !leader.email) continue;

        const role = 'unit_admin';

        await createInvitation({
          email: leader.email,
          member_id: leader.id as Id<"members">,
          intended_role: role,
          intended_units: leader.led_unit_ids as Id<"units">[],
        });

        trackEvent(AnalyticsEventType.MEMBER_INVITED, {
          role,
          delivery: 'email',
        });
      }

      toast({
        title: `${selectedLeaders.length} ${selectedLeaders.length === 1 ? "invitation" : "invitations"} sent`
      });
      setSelectedLeaders([]);
    } catch (err: any) {
      console.error('Send invitations error:', err);
      toast({
        variant: "destructive",
        title: "Couldn't send the invitations",
        description: err.message
      });
    } finally {
      setIsSendingInvites(false)
    }
  }

  const generateInvitationLink = async (leaderId: string) => {
    const leader = potentialLeaders.find(l => l.id === leaderId);
    if (!leader) return;

    try {
      const role = 'unit_admin';
      const email = leader.email && leader.email.trim().length > 0
        ? leader.email
        : `invite+${leader.id}@placeholder.local`;
      const result = await createInvitation({
        email,
        member_id: leader.id as Id<"members">,
        intended_role: role,
        intended_units: leader.led_unit_ids as Id<"units">[],
        organization_id: activeOrganization?._id,
      });

      trackEvent(AnalyticsEventType.MEMBER_INVITED, {
        role,
        delivery: 'link',
      });

      const link = `${window.location.origin}/accept-invitation?token=${result.token}`;
      setGeneratedLink(link);
      setIsInviteLinkDialogOpen(true);
      if (!leader.email) {
        toast({
          title: "Missing email",
          description: "This leader has no email address, so share the invite link with them yourself.",
        });
      }
    } catch (err: any) {
      console.error('Generate invitation link error:', err);
      toast({
        variant: "destructive",
        title: "Couldn't create the invite link",
        description: err.message
      });
    }
  }

  const handleAdminInvite = async () => {
    try {
      let email = adminInviteForm.email;
      let memberId: Id<"members"> | undefined = undefined;

      if (adminInviteMode === 'existing' && selectedMemberId) {
        const member = members.find(m => m._id === selectedMemberId);
        if (member) {
          email = member.email || '';
          memberId = member._id as Id<"members">;
        }
      }

      if (!email) {
        toast({ variant: "destructive", title: "Add an email address", description: "The invitation needs an email to go to." });
        return;
      }

      const result = await createInvitation({
        email,
        member_id: memberId,
        intended_role: 'organization_admin', // Access level for admin
        organization_id: activeOrganization?._id,
      });

      const link = `${window.location.origin}/accept-invitation?token=${result.token}`;
      setGeneratedLink(link);
      setIsInviteLinkDialogOpen(true);
      setIsAdminInviteDialogOpen(false);
    } catch (err: any) {
      console.error('Admin invite error:', err);
      toast({
        variant: "destructive",
        title: "Couldn't create the invite link",
        description: err.message
      });
    }
  }

  // Handler for creating leader invitation with unit assignment
  const handleLeaderInvite = async () => {
    if (!selectedMemberForLeader) {
      toast({ variant: "destructive", title: "Choose a member", description: "Pick the member you want to invite." });
      return;
    }
    if (selectedUnitIds.length === 0) {
      toast({ variant: "destructive", title: "Choose a unit", description: "Pick at least one unit for them to lead." });
      return;
    }

    setIsCreatingLeaderInvite(true);
    try {
      const member = members.find(m => m._id === selectedMemberForLeader);
      if (!member) {
        throw new Error("Member not found");
      }

      const result = await createInvitation({
        email: member.email || '',
        member_id: member._id as Id<"members">,
        intended_role: 'unit_admin',
        intended_units: selectedUnitIds,
        organization_id: activeOrganization?._id,
      });

      const link = `${window.location.origin}/accept-invitation?token=${result.token}`;
      setGeneratedLink(link);
      setIsInviteLinkDialogOpen(true);
      setIsLeaderInviteDialogOpen(false);
      setSelectedMemberForLeader(null);
      setSelectedUnitIds([]);

      toast({ title: "Leader invitation created" });
    } catch (err: any) {
      console.error('Leader invite error:', err);
      toast({
        variant: "destructive",
        title: "Couldn't create the invitation",
        description: err.message
      });
    } finally {
      setIsCreatingLeaderInvite(false);
    }
  }

  const copyToClipboard = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink)
      toast({
        title: 'Invite link copied',
      })
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                Invite {terminology.unit_leader_term.toLowerCase()}s
              </CardTitle>
              <CardDescription>
                Invite {terminology.unit_term.toLowerCase()} leaders to create an account so they can look after their members.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setIsLeaderInviteDialogOpen(true)}
                className="flex items-center gap-2"
              >
                <UserPlus className="h-4 w-4" />
                Invite a leader
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsAdminInviteDialogOpen(true)}
                className="flex items-center gap-2"
              >
                <Mail className="h-4 w-4" />
                Invite an admin
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Organization selector for super_admins */}
          {isSuperAdmin && allOrganizations && allOrganizations.length > 0 && (
            <div className="mb-4 p-4 bg-muted/50 rounded-lg border">
              <Label className="text-sm font-medium mb-2 block">Church</Label>
              <Select
                value={selectedOrgId || allOrganizations[0]?._id}
                onValueChange={(value) => setSelectedOrgId(value as Id<"organizations">)}
              >
                <SelectTrigger className="w-full sm:w-[300px]">
                  <SelectValue placeholder="Choose a church" />
                </SelectTrigger>
                <SelectContent>
                  {allOrganizations.map((org: any) => (
                    <SelectItem key={org._id} value={org._id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!activeOrganization && !isSuperAdmin && (
            <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg mb-4">
              <p className="text-warning-strong">No church chosen. Choose a church to manage its invitations.</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-1">
              <Input
                placeholder="Search leaders…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All leaders</SelectItem>
                <SelectItem value="no_account">No account yet</SelectItem>
                <SelectItem value="has_account">Has an account</SelectItem>
                <SelectItem value="unit_leader">
                  {terminology.unit_term} leaders
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={sendInvitations}
              disabled={selectedLeaders.length === 0 || isSendingInvites}
              className="flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              {isSendingInvites
                ? 'Sending…'
                : `Email invites (${selectedLeaders.length})`}
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={
                        selectedLeaders.length ===
                        filteredLeaders.filter((l) => !l.has_account)
                          .length &&
                        filteredLeaders.filter((l) => !l.has_account).length > 0
                      }
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2"></div>
                        Loading leaders…
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredLeaders.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {searchQuery || roleFilter !== 'all' ? 'No leaders match your search.' : 'No leaders yet. Give a unit a leader and they will show here.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeaders.map((leader) => (
                    <TableRow key={leader.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedLeaders.includes(leader.id)}
                          onCheckedChange={() => handleSelectLeader(leader.id)}
                          disabled={leader.has_account}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {leader.name}
                      </TableCell>
                      <TableCell>{leader.email || <span className="text-muted-foreground">No email</span>}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {leader.led_unit_names &&
                            leader.led_unit_names.map((unitName, index) => (
                              <Badge
                                key={index}
                                variant="default"
                                className="text-xs"
                              >
                                {unitName}
                              </Badge>
                            ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {leader.has_account ? (
                          <Badge
                            variant="secondary"
                            className="flex items-center gap-1 bg-success/15 text-success-strong"
                          >
                            <CheckCircle className="h-3 w-3" />
                            Has an account
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="flex items-center gap-1"
                          >
                            <AlertCircle className="h-3 w-3" />
                            No account yet
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {leader.has_account ? (
                          <span className="text-sm text-muted-foreground">
                            Already signed up
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateInvitationLink(leader.id)}
                            className="flex items-center gap-1"
                          >
                            <Link className="h-3 w-3" />
                            Get invite link
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {pendingInvitations.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Waiting to be accepted</CardTitle>
            <CardDescription>
              Invitations no one has accepted yet. Revoke one to stop its link working.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Units</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvitations.map((inv: any) => (
                    <TableRow key={inv._id}>
                      <TableCell className="font-medium">{inv.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {inviteRoleLabel(inv.intended_role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(inv.intended_units || []).length === 0 ? (
                            <span className="text-xs text-muted-foreground">None</span>
                          ) : (
                            (inv.intended_units || []).map((uid: string) => (
                              <Badge key={uid} variant="outline" className="text-xs">
                                {unitNameById.get(uid) || 'Unknown unit'}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {inv.expires_at ? formatDay(inv.expires_at) : <span className="text-muted-foreground">Never</span>}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevokeInvitation(inv._id)}
                          className="flex items-center gap-1 text-destructive hover:text-destructive"
                        >
                          <XCircle className="h-3 w-3" />
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={isInviteLinkDialogOpen}
        onOpenChange={setIsInviteLinkDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite link ready</DialogTitle>
            <DialogDescription>
              Copy the link and send it to the leader. It lets them create their account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2">
            <Input value={generatedLink || ''} readOnly />
            <Button type="button" size="sm" onClick={copyToClipboard}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isAdminInviteDialogOpen}
        onOpenChange={setIsAdminInviteDialogOpen}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Invite an admin</DialogTitle>
            <DialogDescription>
              An admin can see and change everything for your church.
            </DialogDescription>
          </DialogHeader>

          <div className="flex space-x-1 mb-4 bg-muted p-1 rounded-md">
            <Button
              variant={adminInviteMode === 'new' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setAdminInviteMode('new')}
              className="flex-1"
            >
              <Mail className="mr-2 h-4 w-4" />
              Someone new
            </Button>
            <Button
              variant={adminInviteMode === 'existing' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setAdminInviteMode('existing')}
              className="flex-1"
            >
              <Users className="mr-2 h-4 w-4" />
              A member
            </Button>
          </div>

          {adminInviteMode === 'new' ? (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="firstName" className="text-right">
                  First name
                </Label>
                <Input
                  id="firstName"
                  value={adminInviteForm.firstName}
                  onChange={(e) => setAdminInviteForm(prev => ({ ...prev, firstName: e.target.value }))}
                  className="col-span-3"
                  placeholder="First name"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="lastName" className="text-right">
                  Last name
                </Label>
                <Input
                  id="lastName"
                  value={adminInviteForm.lastName}
                  onChange={(e) => setAdminInviteForm(prev => ({ ...prev, lastName: e.target.value }))}
                  className="col-span-3"
                  placeholder="Last name"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email" className="text-right">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={adminInviteForm.email}
                  onChange={(e) => setAdminInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  className="col-span-3"
                  placeholder="name@example.com"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search members…"
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>

              <div className="max-h-60 overflow-y-auto border rounded-md">
                {members.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No members found
                  </div>
                ) : (
                  <div className="divide-y">
                    {members
                      .filter(m =>
                        m.name.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
                        (m.email && m.email.toLowerCase().includes(memberSearchQuery.toLowerCase()))
                      )
                      .map((m) => (
                        <div
                          key={m._id}
                          className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${selectedMemberId === m._id ? 'bg-primary/10 border-primary' : ''
                            }`}
                          onClick={() => {
                            setSelectedMemberId(m._id as string);
                            setAdminInviteForm({
                              ...adminInviteForm,
                              email: m.email || '',
                              firstName: m.name.split(' ')[0] || '',
                              lastName: m.name.split(' ').slice(1).join(' ') || ''
                            });
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{m.name}</div>
                              <div className="text-sm text-muted-foreground">{m.email}</div>
                            </div>
                            {selectedMemberId === m._id && (
                              <CheckCircle className="h-5 w-5 text-primary" />
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsAdminInviteDialogOpen(false)
                setAdminInviteMode('new')
                setSelectedMemberId(null)
                setMemberSearchQuery('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdminInvite}
              disabled={adminInviteMode === 'existing' && !selectedMemberId}
              className="flex items-center gap-1"
            >
              <Link className="h-3 w-3" />
              Get invite link
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Leader Invitation Dialog */}
      <Dialog
        open={isLeaderInviteDialogOpen}
        onOpenChange={setIsLeaderInviteDialogOpen}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Invite a leader</DialogTitle>
            <DialogDescription>
              Choose a member and the units they will lead. When they accept, they become the leader of those units.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Member Selection */}
            <div className="space-y-2">
              <Label>Member</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search members…"
                  value={leaderMemberSearchQuery}
                  onChange={(e) => setLeaderMemberSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <div className="max-h-40 overflow-y-auto border rounded-md">
                {members.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No members found
                  </div>
                ) : (
                  <div className="divide-y">
                    {members
                      .filter((m: any) => {
                        if (!activeOrganization?._id) return false;
                        const memberOrgId = m.organization_id;
                        return memberOrgId === activeOrganization._id;
                      })
                      .filter((m: any) => {
                        if (!leaderMemberSearchQuery) return true;
                        const name = m.name || '';
                        const email = m.email || '';
                        return name.toLowerCase().includes(leaderMemberSearchQuery.toLowerCase()) ||
                          email.toLowerCase().includes(leaderMemberSearchQuery.toLowerCase());
                      })
                      .map((m: any) => (
                        <div
                          key={m._id}
                          className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${selectedMemberForLeader === m._id ? 'bg-primary/10' : ''}`}
                          onClick={() => {
                            setSelectedMemberForLeader(m._id as string);
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{m.name}</div>
                              <div className="text-sm text-muted-foreground">{m.email}</div>
                            </div>
                            {selectedMemberForLeader === m._id && (
                              <CheckCircle className="h-5 w-5 text-primary" />
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Unit Selection */}
            <div className="space-y-2">
              <Label>Units they will lead</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search units…"
                  value={unitSearchQuery}
                  onChange={(e) => setUnitSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <div className="max-h-40 overflow-y-auto border rounded-md">
                {allUnits.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No units found
                  </div>
                ) : (
                  <div className="space-y-2 p-2">
                    {allUnits
                      .filter((u: any) => {
                        if (!unitSearchQuery) return true;
                        return u.name.toLowerCase().includes(unitSearchQuery.toLowerCase());
                      })
                      .map((u: any) => (
                        <div
                          key={u._id}
                          className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors rounded-md flex items-center gap-2 ${selectedUnitIds.includes(u._id) ? 'bg-primary/10' : ''}`}
                          onClick={() => {
                            setSelectedUnitIds(prev =>
                              prev.includes(u._id)
                                ? prev.filter(id => id !== u._id)
                                : [...prev, u._id]
                            );
                          }}
                        >
                          <Checkbox
                            checked={selectedUnitIds.includes(u._id)}
                            onCheckedChange={() => {
                              setSelectedUnitIds(prev =>
                                prev.includes(u._id)
                                  ? prev.filter(id => id !== u._id)
                                  : [...prev, u._id]
                              );
                            }}
                          />
                          <div>
                            <div className="font-medium">{u.name}</div>
                            {u.type && (
                              <Badge variant="outline" className="ml-2">
                                {u.type.charAt(0).toUpperCase() + u.type.slice(1)}
                              </Badge>
                            )}
                            {u.leader_id && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                Already has a leader, so they join as a co-admin
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsLeaderInviteDialogOpen(false);
                setSelectedMemberForLeader(null);
                setSelectedUnitIds([]);
                setLeaderMemberSearchQuery('');
                setUnitSearchQuery('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleLeaderInvite}
              disabled={!selectedMemberForLeader || selectedUnitIds.length === 0 || isCreatingLeaderInvite}
              className="flex items-center gap-1"
            >
              {isCreatingLeaderInvite ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating…
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create invitation
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
