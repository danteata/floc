"use client"

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { formatDistanceToNow } from "date-fns"
import { HeartHandshake, Loader2, Sparkles, TrendingUp } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import { useOrganization } from "@/hooks/use-organization"
import { useUserRole } from "@/hooks/use-user-role"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { LoadingState } from "@/components/ui/loading-state"
import { AssignFollowUpDialog } from "@/components/assign-follow-up-dialog"
import { cn } from "@/lib/utils"

type Status = "pending" | "contacted" | "resolved"

const STATUS_LABEL: Record<Status, string> = {
  pending: "Pending",
  contacted: "Contacted",
  resolved: "Resolved",
}

const STATUS_VARIANT: Record<Status, "outline" | "secondary" | "default"> = {
  pending: "outline",
  contacted: "secondary",
  resolved: "default",
}

const NEXT_STATUS: Record<Status, Status | null> = {
  pending: "contacted",
  contacted: "resolved",
  resolved: null,
}

type CareTask = {
  _id: Id<"care_tasks">
  member_id: Id<"members">
  assigned_to: Id<"members">
  status: string
  source: string
  created_at: string
  member_name: string
  member_avatar_url?: string
  assignee_name: string
}

function TaskRow({ task }: { task: CareTask }) {
  const [note, setNote] = useState("")
  const [showNote, setShowNote] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const updateStatus = useMutation(api.care_tasks.updateStatus)

  const status = task.status as Status
  const next = NEXT_STATUS[status]

  const advance = async () => {
    if (!next) return
    setIsSubmitting(true)
    try {
      await updateStatus({ id: task._id, status: next, note: note || undefined })
      setNote("")
      setShowNote(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={task.member_avatar_url} alt={task.member_name} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {task.member_name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium leading-none">{task.member_name}</p>
            <p className="text-xs text-muted-foreground">
              Assigned to {task.assignee_name} ·{" "}
              {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
              {task.source === "automation" && " · automated"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
          {next && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowNote((s) => !s)}
              disabled={isSubmitting}
            >
              Mark {STATUS_LABEL[next]}
            </Button>
          )}
        </div>
      </div>
      {showNote && (
        <div className="flex flex-col gap-2 pl-11">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What happened? (optional)"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowNote(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={advance} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

type QueueMember = {
  id: Id<"members">
  name: string
  avatar_url?: string
  engagement_score?: number
  engagement_risk_level?: string
  household_id?: Id<"households">
  impact: number
  impact_level: "high" | "medium" | "low"
  days_since_last?: number
  reasons: string[]
}

function impactBadgeClass(level: "high" | "medium" | "low") {
  if (level === "high") return "bg-destructive/10 text-destructive border-destructive/30"
  if (level === "medium") return "bg-amber-500/10 text-amber-600 border-amber-500/30"
  return "bg-muted text-muted-foreground border-border/60"
}

/**
 * "Members Recovered" — proof the care loop works. Reads careImpactStats,
 * which attributes at-risk follow-ups to subsequent recovery. Renders nothing
 * until there's something to show (Free orgs / no attributed contacts yet).
 */
function ImpactStatsBanner({ organizationId }: { organizationId: Id<"organizations"> }) {
  const stats = useQuery(api.engagement.queries.careImpactStats, {
    organization_id: organizationId,
  })
  if (!stats || !stats.scoringActive) return null

  if (stats.atRiskContacted === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-success" />
            <p className="text-sm font-medium">Care impact</p>
          </div>
          <p className="text-xs text-muted-foreground">
            No recoveries tracked yet — assign follow-ups below and, as those at-risk members
            re-engage, your recovery count will appear here.
          </p>
        </CardContent>
      </Card>
    )
  }

  const tiles = [
    { label: "Recovered", value: stats.recovered, tone: "text-success" },
    { label: "Improving", value: stats.improving, tone: "text-amber-600" },
    { label: "No change yet", value: stats.stillAtRisk, tone: "text-muted-foreground" },
    { label: "Recovery rate", value: `${stats.recoveryRate}%`, tone: "text-foreground" },
  ]

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-success" />
            <p className="text-sm font-medium">
              Care impact{" "}
              <span className="text-muted-foreground font-normal">
                · last {stats.windowDays} days
              </span>
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Outcomes for the members you've followed up with — not the total at-risk count.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg border border-border/50 p-3">
              <div className={cn("text-2xl font-semibold leading-none", t.tone)}>{t.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{t.label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Of {stats.atRiskContacted} at-risk {stats.atRiskContacted === 1 ? "member" : "members"}{" "}
          followed up with, {stats.recovered} came back to a healthy engagement level.
        </p>
      </CardContent>
    </Card>
  )
}

function QueueRow({
  member,
  organizationId,
}: {
  member: QueueMember
  organizationId: Id<"organizations">
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/60 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={member.avatar_url} alt={member.name} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {member.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-none">{member.name}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {member.reasons.map((r) => (
              <Badge
                key={r}
                variant="outline"
                className="text-[10px] font-normal text-muted-foreground"
              >
                {r}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-11 sm:pl-0">
        <Badge
          variant="outline"
          className={cn("text-[10px] capitalize", impactBadgeClass(member.impact_level))}
        >
          {member.impact_level} priority
        </Badge>
        <AssignFollowUpDialog
          organizationId={organizationId}
          members={[{ id: member.id, name: member.name, household_id: member.household_id }]}
          trigger={
            <Button size="sm" variant="outline" className="h-7 text-xs">
              Follow up
            </Button>
          }
        />
      </div>
    </div>
  )
}

function CareQueue({ organizationId }: { organizationId: Id<"organizations"> }) {
  const queue = useQuery(api.engagement.queries.careQueue, {
    organization_id: organizationId,
  }) as QueueMember[] | undefined

  return (
    <div className="space-y-4">
      <ImpactStatsBanner organizationId={organizationId} />
      <Card>
        <CardContent className="p-0">
          {queue === undefined ? (
            <LoadingState />
          ) : queue.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No one needs a call right now"
              description="At-risk members without an open follow-up show up here, ranked by how much your outreach is likely to help. Requires engagement scoring (Pro)."
            />
          ) : (
            <div>
              {queue.map((m) => (
                <QueueRow key={m.id} member={m} organizationId={organizationId} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function CareTasksContent() {
  const { organization } = useOrganization()
  const { isAdmin, isUnitLeader, isLoading: roleLoading } = useUserRole()
  const [view, setView] = useState<"queue" | "tasks">("queue")
  const [scope, setScope] = useState<"mine" | "team">("mine")
  const [status, setStatus] = useState<Status | "all">("pending")

  const canSeeTeam = isAdmin || isUnitLeader

  const mine = useQuery(
    api.care_tasks.listMine,
    scope === "mine" ? { status: status === "all" ? undefined : status } : "skip",
  )
  const team = useQuery(
    api.care_tasks.list,
    scope === "team" && organization?._id
      ? {
          organization_id: organization._id,
          status: status === "all" ? undefined : status,
        }
      : "skip",
  )

  const tasks = (scope === "mine" ? mine : team) as CareTask[] | undefined

  const isLoading = roleLoading || tasks === undefined

  return (
    <div className="space-y-4">
      <PageHeader
        title="Care"
        description="Who to reach out to next, and the follow-ups already under way."
      />

      <Tabs value={view} onValueChange={(v) => setView(v as "queue" | "tasks")}>
        <TabsList>
          <TabsTrigger value="queue" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Care Queue
          </TabsTrigger>
          <TabsTrigger value="tasks">Follow-ups</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "queue" ? (
        organization ? (
          <CareQueue organizationId={organization._id} />
        ) : (
          <LoadingState />
        )
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {canSeeTeam && (
              <Tabs value={scope} onValueChange={(v) => setScope(v as "mine" | "team")}>
                <TabsList>
                  <TabsTrigger value="mine">My tasks</TabsTrigger>
                  <TabsTrigger value="team">Team</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <Tabs value={status} onValueChange={(v) => setStatus(v as Status | "all")}>
              <TabsList>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="contacted">Contacted</TabsTrigger>
                <TabsTrigger value="resolved">Resolved</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <LoadingState />
              ) : tasks.length === 0 ? (
                <EmptyState
                  icon={HeartHandshake}
                  title="No care tasks here"
                  description={
                    scope === "mine"
                      ? "You're all caught up — nothing needs your follow-up right now."
                      : "No follow-up tasks match this filter."
                  }
                />
              ) : (
                <div>
                  {tasks.map((t) => (
                    <TaskRow key={t._id} task={t} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
