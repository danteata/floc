"use client"

import { Link } from "react-router-dom"
import { useQuery } from "convex/react"
import { TrendingUp, ArrowRight } from "lucide-react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { useOrganization } from "@/hooks/use-organization"
import { cn } from "@/lib/utils"

/**
 * "Care impact" dashboard widget: the recovery side of the care story that
 * pairs with AtRiskWidget. Reads careImpactStats (scope-aware, Pro-gated by
 * data) and, like the other care widgets, renders nothing until there's
 * something to show: Free orgs, plain members, and orgs with no attributed
 * at-risk follow-ups yet all get null.
 */
export function CareImpactWidget({ unitId }: { unitId?: Id<"units"> } = {}) {
  const { organization } = useOrganization()
  const stats = useQuery(
    api.engagement.queries.careImpactStats,
    organization ? { organization_id: organization._id, ...(unitId ? { unit_id: unitId } : {}) } : "skip",
  )

  // Hide entirely when scoring doesn't apply (Free orgs / no scored members in
  // scope). When it does apply but nothing's attributed yet, show an inviting
  // empty state so the feature is discoverable and self-explanatory.
  if (!organization || !stats || !stats.scoringActive) return null

  const header = (description: string) => (
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg font-semibold">
        <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Care impact
      </CardTitle>
      <CardDescription>{description}</CardDescription>
      <CardAction>
        <Button asChild size="sm" variant="ghost">
          <Link to="/care">
            Open care <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardAction>
    </CardHeader>
  )

  if (stats.atRiskContacted === 0) {
    return (
      <Card>
        {header("How many at-risk members come back after a follow-up")}
        <CardContent>
          <EmptyState
            icon={TrendingUp}
            title="No recoveries tracked yet"
            description="Assign follow-ups from Care. As those members come back, they'll show up here."
            className="py-6"
          />
        </CardContent>
      </Card>
    )
  }

  const tiles = [
    { label: "Recovered", value: stats.recovered, tone: "text-success-strong" },
    { label: "Improving", value: stats.improving, tone: "text-warning-strong" },
    { label: "No change yet", value: stats.stillAtRisk, tone: "text-muted-foreground" },
    { label: "Recovery rate", value: `${stats.recoveryRate}%`, tone: "text-foreground" },
  ]

  return (
    <Card>
      {header(`Follow-up outcomes over the last ${stats.windowDays} days`)}
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg border border-border p-3">
              <div className={cn("text-2xl font-semibold leading-none tabular-nums", t.tone)}>{t.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Of {stats.atRiskContacted} at-risk {stats.atRiskContacted === 1 ? "member" : "members"}{" "}
          followed up with, {stats.recovered} came back to a healthy engagement level.
        </p>
      </CardContent>
    </Card>
  )
}
