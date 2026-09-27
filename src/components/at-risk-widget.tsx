"use client"

import { Link } from "react-router-dom"
import { useQuery } from "convex/react"
import { AlertTriangle, ArrowRight } from "lucide-react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { MemberAvatar } from "@/components/ui/member-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AssignFollowUpDialog } from "@/components/assign-follow-up-dialog"
import { useOrganization } from "@/hooks/use-organization"
import { cn } from "@/lib/utils"

const MAX_SHOWN = 5

/** Risk levels from convex/engagement/scoring.ts, as a badge reads them. */
const RISK: Record<string, { label: string; tone: string }> = {
  high: { label: "High risk", tone: "bg-destructive/15 text-destructive-strong" },
  medium: { label: "Medium risk", tone: "bg-warning/15 text-warning-strong" },
  low: { label: "Low risk", tone: "bg-success/15 text-success-strong" },
  new: { label: "New member", tone: "bg-info/15 text-info-strong" },
}

/**
 * "N members at risk": high and medium risk members from the daily
 * engagement-score recompute (Pro feature). Renders nothing for Free orgs or
 * when no one in scope is at risk, same as MyCareTasksWidget's empty-state
 * convention.
 */
export function AtRiskWidget({ unitId }: { unitId?: Id<"units"> } = {}) {
  const { organization } = useOrganization()
  const result = useQuery(
    api.engagement.queries.listAtRisk,
    organization
      ? { organization_id: organization._id, limit: MAX_SHOWN, ...(unitId ? { unit_id: unitId } : {}) }
      : "skip",
  )
  const atRisk = result?.members ?? []

  if (!organization || !result || atRisk.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Members at risk
        </CardTitle>
        <CardDescription>
          {result.total} {result.total === 1 ? "member" : "members"} at risk
          {result.total > atRisk.length && `, showing ${atRisk.length}`}
        </CardDescription>
        <CardAction>
          <Button asChild size="sm" variant="ghost">
            <Link to="/members">
              View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1">
        {atRisk.map((m) => {
          const risk = m.engagement_risk_level ? RISK[m.engagement_risk_level] : undefined
          return (
            <div key={m.id} className="flex items-center justify-between gap-3 py-1.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <MemberAvatar name={m.name} src={m.avatar_url} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium leading-none">{m.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Engagement {m.engagement_score}/100</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {risk && (
                  <Badge variant="outline" className={cn("border-transparent", risk.tone)}>
                    {risk.label}
                  </Badge>
                )}
                <AssignFollowUpDialog
                  organizationId={organization._id}
                  members={[{ id: m.id, name: m.name, household_id: m.household_id }]}
                  trigger={
                    <Button size="sm" variant="outline" className="h-7 text-xs">
                      Follow up
                    </Button>
                  }
                />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
