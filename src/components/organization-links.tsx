'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import {
  Building2,
  Copy,
  RefreshCw,
  LogIn,
  LogOut,
  Trash2,
  ArrowUpRight,
  Network,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useOrganization } from '@/hooks/use-organization'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

interface OrgNode {
  _id: string
  name: string
  depth?: number
  path?: string
}

// Manage this organization's place in the org tree: link under a parent org via
// an invite code (or leave it), and manage the sub-organizations linked under
// this one. Deliberately generic — "parent org" / "sub-organization" so it
// reapplies to any context, not just a specific hierarchy vocabulary.
export function OrganizationLinks() {
  const { context, homeOrganization, viewOrganization } = useOrganization()
  const homeOrg = useQuery(api.organizations.current)
  const parentOrg = useQuery(api.organizations.getParentOrganization)

  const generateInviteCode = useMutation(api.organizations.generateInviteCode)
  const joinByCode = useMutation(api.organizations.joinOrganizationByCode)
  const leaveParent = useMutation(api.organizations.leaveParentOrganization)
  const removeSubOrg = useMutation(api.organizations.removeSubOrganization)

  const accessible: OrgNode[] = context?.accessibleOrganizations || []
  const subOrgs = accessible
    .filter((o) => o._id !== homeOrganization?._id)
    .sort((a, b) => (a.path || '').localeCompare(b.path || ''))

  const isLinkedToParent = !!parentOrg
  const inviteCode: string | undefined = homeOrg?.invite_code

  const [codeInput, setCodeInput] = useState('')
  const trimmedCode = codeInput.trim()
  const lookup = useQuery(
    api.organizations.getOrganizationByInviteCode,
    trimmedCode ? { code: trimmedCode } : 'skip'
  )
  const [busy, setBusy] = useState(false)

  const handleGenerate = async () => {
    setBusy(true)
    try {
      const { code } = await generateInviteCode({})
      toast.success(inviteCode ? `New invite code: ${code}` : `Invite code created: ${code}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create an invite code")
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    if (!inviteCode) return
    await navigator.clipboard.writeText(inviteCode)
    toast.success('Invite code copied')
  }

  const handleJoin = async () => {
    if (!lookup) return
    setBusy(true)
    try {
      const { parent } = await joinByCode({ code: trimmedCode })
      toast.success(`Linked under ${parent}`)
      setCodeInput('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't link your church")
    } finally {
      setBusy(false)
    }
  }

  const handleLeave = async () => {
    if (!confirm(`Leave ${parentOrg?.name}? Their admins will no longer oversee your church.`)) return
    setBusy(true)
    try {
      await leaveParent({})
      toast.success('No longer linked to the parent church')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't unlink from the parent church")
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveSubOrg = async (subOrg: OrgNode) => {
    if (!confirm(`Remove ${subOrg.name}? It becomes independent again and keeps all its data.`)) return
    setBusy(true)
    try {
      await removeSubOrg({ organization_id: subOrg._id as Id<'organizations'> })
      toast.success(`${subOrg.name} removed`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove the church")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Membership: which parent org this org is linked under */}
      {isLinkedToParent ? (
        <Card className="rounded-xl">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">Linked under</div>
                <div className="font-medium truncate">{parentOrg?.name}</div>
              </div>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" disabled={busy} onClick={handleLeave}>
              <LogOut className="h-3.5 w-3.5" />
              Leave
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <LogIn className="h-4 w-4 text-muted-foreground" />
              Link to a parent church
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the invite code a parent church gave you. Your church keeps all its
              data and admins, and the parent church can see and help oversee it.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="ORG-XXXXX"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                className="max-w-[220px] font-mono tracking-wide uppercase"
              />
              <Button
                disabled={busy || !lookup}
                onClick={handleJoin}
                className="gap-1.5"
              >
                <LogIn className="h-4 w-4" />
                Link
              </Button>
            </div>
            {trimmedCode && lookup === null && (
              <p className="text-xs text-destructive">No church found with that code.</p>
            )}
            {lookup && (
              <p className="text-xs text-muted-foreground">
                This code belongs to <span className="font-medium text-foreground">{lookup.name}</span>.
                Linking lets them oversee your church.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sub-organizations linked under this org */}
      <Card className="rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Network className="h-4 w-4 text-muted-foreground" />
            Linked churches
            {subOrgs.length > 0 && (
              <Badge variant="secondary" className="ml-1">{subOrgs.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-sm text-muted-foreground mb-2">
              Share this code with another church. Their admin enters it to link their church under yours.
            </div>
            {inviteCode ? (
              <div className="flex items-center gap-2">
                <code className="px-3 py-1.5 rounded-lg bg-muted font-mono text-sm tracking-wider">
                  {inviteCode}
                </code>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleCopy} title="Copy code" aria-label="Copy code">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" disabled={busy} onClick={handleGenerate} title="Replace with a new code">
                  <RefreshCw className="h-3.5 w-3.5" />
                  New code
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={handleGenerate}>
                <RefreshCw className="h-3.5 w-3.5" />
                Create invite code
              </Button>
            )}
          </div>

          {subOrgs.length > 0 ? (
            <div className="space-y-1.5">
              {subOrgs.map((subOrg) => {
                const indent = Math.max(0, (subOrg.depth ?? 0) - ((homeOrganization?.depth ?? 0) + 1))
                return (
                  <div
                    key={subOrg._id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/40 hover:border-border transition-colors"
                    style={{ marginLeft: `${indent * 16}px` }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {indent > 0 && <span className="text-muted-foreground/40 select-none">└</span>}
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{subOrg.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground"
                        onClick={() => viewOrganization(subOrg._id)}
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={busy}
                        onClick={() => handleRemoveSubOrg(subOrg)}
                        title="Remove this church" aria-label={`Remove ${subOrg.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground border border-dashed border-border/50 rounded-lg p-4 text-center">
              No linked churches yet. Share your invite code to link other churches under yours.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
