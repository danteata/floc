"use client"

import { Link } from "react-router-dom"
import { useQuery } from "convex/react"
import { AlertTriangle, ArrowRight } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { MemberAvatar } from "@/components/ui/member-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AssignFollowUpDialog } from "@/components/assign-follow-up-dialog"
import { useOrganization } from "@/hooks/use-organization"

const MAX_SHOWN = 5

function riskBadgeVariant(level?: string) {
  if (level === "high") return "destructive" as const
  if (level === "medium") return "outline" as const
  return "secondary" as const
}

/**
 * "N members need outreach" — reads from the daily engagement-score
 * recompute (Pro feature). Renders nothing for Free orgs or orgs with no
 * scored members yet, same as MyCareTasksWidget's empty-state convention.
 */
export function AtRiskWidget() {
  const { organization } = useOrganization()
  const atRisk = useQuery(
    api.engagement.queries.listAtRisk,
    organization ? { organization_id: organization._id, limit: MAX_SHOWN } : "skip",
  )

  if (!organization || !atRisk || atRisk.length === 0) return null

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/30 bg-muted/10 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning-strong" />
            Members at Risk
          </CardTitle>
          <CardDescription>
            {atRisk.length} {atRisk.length === 1 ? "member" : "members"} with a low engagement score
          </CardDescription>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link to="/members">
            View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-4 space-y-1">
        {atRisk.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 py-1.5">
            <div className="flex items-center gap-2.5">
              <MemberAvatar name={m.name} src={m.avatar_url} size="sm" />
              <div>
                <p className="text-sm font-medium leading-none">{m.name}</p>
                <p className="text-xs text-muted-foreground">Score: {m.engagement_score}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={riskBadgeVariant(m.engagement_risk_level)} className="text-[10px] capitalize">
                {m.engagement_risk_level}
              </Badge>
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
        ))}
      </CardContent>
    </Card>
  )
}
