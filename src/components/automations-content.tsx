"use client"

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { toast } from "sonner"
import { formatDistanceToNow, format } from "date-fns"
import {
  Zap, Plus, FlaskConical, MoreHorizontal, Pencil, Play, Pause, Trash2, Beaker, Radio,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingState } from "@/components/ui/loading-state"
import { NoAccess } from "@/components/ui/no-access"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { useOrganization } from "@/hooks/use-organization"
import { useUserRole } from "@/hooks/use-user-role"

import { RuleStatusBadge, OutcomeBadge } from "@/components/automations/badges"
import { TemplateGalleryDialog } from "@/components/automations/template-gallery-dialog"
import { RuleEditorDialog } from "@/components/automations/rule-editor-dialog"
import { SimulateDialog } from "@/components/automations/simulate-dialog"
import { AutomationTemplate } from "@/components/automations/templates"

const CHANNEL_LABEL: Record<string, string> = { in_app: "In-app", sms: "SMS" }
const channelLabel = (channel?: string) =>
  channel ? CHANNEL_LABEL[channel] ?? channel.charAt(0).toUpperCase() + channel.slice(1).replace(/_/g, " ") : ""

export function AutomationsContent() {
  const { organization } = useOrganization()
  const { isAdmin, isLoading: roleLoading } = useUserRole()

  const orgArg = organization?._id ? { organization_id: organization._id } : "skip"
  const rules = useQuery(api.automation.rules.listRules, orgArg)
  const catalog = useQuery(api.automation.rules.getCatalog, {})
  const messages = useQuery(api.automation.rules.listMessages, orgArg)

  const setRuleStatus = useMutation(api.automation.rules.setRuleStatus)
  const deleteRule = useMutation(api.automation.rules.deleteRule)

  const [galleryOpen, setGalleryOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorTemplate, setEditorTemplate] = useState<AutomationTemplate | undefined>()
  const [editorRule, setEditorRule] = useState<any | null>(null)
  const [simulateRule, setSimulateRule] = useState<any | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)

  const triggerLabel = (key: string) =>
    catalog?.triggers.find((t: any) => t.key === key)?.label || key

  const openNew = (template: AutomationTemplate) => {
    setGalleryOpen(false)
    setEditorRule(null)
    setEditorTemplate(template)
    setEditorOpen(true)
  }
  const openEdit = (rule: any) => {
    setEditorTemplate(undefined)
    setEditorRule(rule)
    setEditorOpen(true)
  }

  const handleToggleStatus = async (rule: any) => {
    const next = rule.status === "enabled" ? "paused" : "enabled"
    try {
      await setRuleStatus({ id: rule._id, status: next })
      toast.success(next === "enabled" ? "Automation enabled" : "Automation paused")
    } catch (e) {
      toast.error("Couldn't change the automation", { description: e instanceof Error ? e.message : undefined })
    }
  }

  const handleToggleDryRun = async (rule: any) => {
    try {
      await setRuleStatus({ id: rule._id, status: rule.status, dry_run: !rule.dry_run })
      toast.success(rule.dry_run ? "Switched to live sending" : "Switched to dry run")
    } catch (e) {
      toast.error("Couldn't switch the mode", { description: e instanceof Error ? e.message : undefined })
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteRule({ id: deleteTarget._id })
      toast.success(`"${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
    } catch (e) {
      toast.error("Couldn't delete the automation", { description: e instanceof Error ? e.message : undefined })
    }
  }

  if (!roleLoading && !isAdmin) {
    return <NoAccess what="set up automations" />
  }

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="Automations"
        description="Rules that act for you: follow up on absences, greet birthdays, welcome new members."
        actions={
          <>
            <Button onClick={() => setGalleryOpen(true)} className="shadow-sm rounded-lg gap-2">
              <Plus className="h-4 w-4" /> New automation
            </Button>
          </>
        }
      />

      <Tabs defaultValue="rules" className="w-full">
        <TabsList className="bg-muted/50 p-1 rounded-xl w-full md:w-auto inline-flex">
          <TabsTrigger value="rules" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">Rules</TabsTrigger>
          <TabsTrigger value="activity" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">Activity</TabsTrigger>
        </TabsList>

        {/* Rules */}
        <TabsContent value="rules" className="mt-6 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/50 px-6 py-4">
              <CardTitle className="text-lg font-semibold">Rules</CardTitle>
              <CardDescription>New rules start as drafts in dry run, so nothing is sent. Simulate one, then switch it to live.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {rules === undefined ? (
                <LoadingState message="Loading automations…" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/50">
                      <TableHead className="py-4 pl-6">Name</TableHead>
                      <TableHead className="hidden md:table-cell">Trigger</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Last run</TableHead>
                      <TableHead className="text-right pr-6 w-[140px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule: any) => (
                      <TableRow key={rule._id} className="border-border/50 hover:bg-muted/30 transition-colors">
                        <TableCell className="py-4 pl-6">
                          <div className="font-medium text-foreground">{rule.name}</div>
                          {rule.description && (
                            <div className="text-xs text-muted-foreground line-clamp-1 max-w-md">{rule.description}</div>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{triggerLabel(rule.trigger_key)}</TableCell>
                        <TableCell><RuleStatusBadge status={rule.status} dryRun={rule.dry_run} /></TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {rule.last_run_at ? formatDistanceToNow(new Date(rule.last_run_at), { addSuffix: true }) : "Never"}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setSimulateRule(rule)}>
                              <FlaskConical className="h-4 w-4" /> <span className="hidden sm:inline">Simulate</span>
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEdit(rule)}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleToggleStatus(rule)}>
                                  {rule.status === "enabled" ? <><Pause className="h-4 w-4 mr-2" /> Pause</> : <><Play className="h-4 w-4 mr-2" /> Enable</>}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleToggleDryRun(rule)}>
                                  {rule.dry_run ? <><Radio className="h-4 w-4 mr-2" /> Switch to live</> : <><Beaker className="h-4 w-4 mr-2" /> Switch to dry run</>}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(rule)}>
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {rules.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-40">
                          <EmptyState
                            icon={Zap}
                            title="No automations yet"
                            description="Start with a template, like following up when a member misses a few services."
                            action={<Button onClick={() => setGalleryOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> New automation</Button>}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity" className="mt-6 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/50 px-6 py-4">
              <CardTitle className="text-lg font-semibold">Recent activity</CardTitle>
              <CardDescription>Every message your automations sent, skipped or held back in dry run.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {messages === undefined ? (
                <LoadingState message="Loading activity…" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/50">
                      <TableHead className="py-4 pl-6">When</TableHead>
                      <TableHead className="hidden sm:table-cell">Channel</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead className="hidden md:table-cell">Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messages.map((m: any) => (
                      <TableRow key={m._id} className="border-border/50">
                        <TableCell className="py-3 pl-6 text-sm text-muted-foreground whitespace-nowrap">
                          {m.sent_at ? format(new Date(m.sent_at), "d MMM, HH:mm") : "Not sent"}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm">{channelLabel(m.channel)}</TableCell>
                        <TableCell><OutcomeBadge outcome={m.outcome} /></TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground line-clamp-1 max-w-md">
                          {m.rendered_preview || m.error || "No preview"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {messages.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="h-40">
                          <EmptyState icon={FlaskConical} title="No activity yet" description="Once automations run, their sends and skips show up here." />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <TemplateGalleryDialog open={galleryOpen} onOpenChange={setGalleryOpen} onSelect={openNew} />
      <RuleEditorDialog open={editorOpen} onOpenChange={setEditorOpen} template={editorTemplate} existingRule={editorRule} />
      <SimulateDialog open={!!simulateRule} onOpenChange={(o) => !o && setSimulateRule(null)} rule={simulateRule} />
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete automation"
        description={`Delete "${deleteTarget?.name}"? This can't be undone.`}
        onConfirm={handleDelete}
      />
    </div>
  )
}
