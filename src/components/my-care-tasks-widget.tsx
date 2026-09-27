"use client"

import { Link } from "react-router-dom"
import { useQuery } from "convex/react"
import { formatDistanceToNow } from "date-fns"
import { ArrowRight, HeartHandshake } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { MemberAvatar } from "@/components/ui/member-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const MAX_SHOWN = 5

/** Care task statuses (convex/care_tasks.ts) as a badge reads them. */
const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pending", tone: "bg-warning/15 text-warning-strong" },
  contacted: { label: "Contacted", tone: "bg-info/15 text-info-strong" },
  resolved: { label: "Resolved", tone: "bg-success/15 text-success-strong" },
}

/** "N members need your attention": only renders when there's something to show. */
export function MyCareTasksWidget() {
  const tasks = useQuery(api.care_tasks.listMine, {})

  if (!tasks || tasks.length === 0) return null

  const pending = tasks.filter((t) => t.status !== "resolved")
  if (pending.length === 0) return null
  // One member can have more than one open task; the headline counts people.
  const pendingMembers = new Set(pending.map((t) => t.member_id)).size

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <HeartHandshake className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Your care tasks
        </CardTitle>
        <CardDescription>
          {pendingMembers} {pendingMembers === 1 ? "member needs" : "members need"} your attention
        </CardDescription>
        <CardAction>
          <Button asChild size="sm" variant="ghost">
            <Link to="/care">
              View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1">
        {pending.slice(0, MAX_SHOWN).map((task) => (
          <div key={task._id} className="flex items-center justify-between gap-3 py-1.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <MemberAvatar name={task.member_name} src={task.member_avatar_url} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-none">{task.member_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Assigned {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
            <Badge variant="outline" className={cn("shrink-0 border-transparent", STATUS[task.status]?.tone ?? "bg-muted text-muted-foreground")}>
              {STATUS[task.status]?.label ?? task.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
