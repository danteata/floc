"use client"

import { Link } from "react-router-dom"
import { useQuery } from "convex/react"
import { TrendingUp, ArrowRight } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useOrganization } from "@/hooks/use-organization"
import { cn } from "@/lib/utils"

/**
 * "Care impact" dashboard widget — the recovery side of the care story that
 * pairs with AtRiskWidget. Reads careImpactStats (scope-aware, Pro-gated by
 * data) and, like the other care widgets, renders nothing until there's
 * something to show: Free orgs, plain members, and orgs with no attributed
 * at-risk follow-ups yet all get null.
 */
export function CareImpactWidget() {
  const { organization } = useOrganization()
  const stats = useQuery(
    api.engagement.queries.careImpactStats,
    organization ? { organization_id: organization._id } : "skip",
  )

  // Hide entirely when scoring doesn't apply (Free orgs / no scored members in
  // scope). When it does apply but nothing's attributed yet, show an inviting
  // empty state so the feature is discoverable and self-explanatory.
  if (!organization || !stats || !stats.scoringActive) return null

  if (stats.atRiskContacted === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/30 bg-muted/10 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" />
              Care Impact
            </CardTitle>
            <CardDescription>Track how many at-risk members you win back</CardDescription>
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link to="/care">
              Care Queue <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            No recoveries tracked yet. Assign follow-ups from the{" "}
            <Link to="/care" className="text-primary underline underline-offset-2">
              Care Queue
            </Link>
            , and as those members re-engage they'll show up here.
          </p>
        </CardContent>
      </Card>
    )
  }

  const tiles = [
    { label: "Recovered", value: stats.recovered, tone: "text-success" },
    { label: "Improving", value: stats.improving, tone: "text-warning-strong" },
    { label: "No change yet", value: stats.stillAtRisk, tone: "text-muted-foreground" },
    { label: "Recovery rate", value: `${stats.recoveryRate}%`, tone: "text-foreground" },
  ]

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/30 bg-muted/10 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-success" />
            Care Impact
          </CardTitle>
          <CardDescription>
            Follow-up outcomes over the last {stats.windowDays} days
          </CardDescription>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link to="/care">
            Open care <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-4">
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
