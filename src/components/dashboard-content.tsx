"use client"

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom"
import { ArrowRight, Calendar, Church, Users } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard, StatGrid } from "@/components/ui/stat-card"
import { Overview } from "@/components/overview"
import { RecentMembers } from "@/components/recent-members"
import { UpcomingEvents } from "@/components/upcoming-events"
import { BirthdayWidget } from "@/components/birthday-widget"
import { FinancialWidget } from "@/components/financial-widget"
import { MyCareTasksWidget } from "@/components/my-care-tasks-widget"
import { AtRiskWidget } from "@/components/at-risk-widget"
import { CareImpactWidget } from "@/components/care-impact-widget"
import { useUserRole, useAccessibleUnits } from "@/hooks/use-user-role"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScopeBadge } from "@/components/scope-badge"
import { useState } from "react"
import { format } from "date-fns"
import { formatDay, sessionName } from "@/lib/display"

export function DashboardContent() {
  const { isAdmin, role } = useUserRole()
  const { ministries, isLoading: unitsLoading } = useAccessibleUnits()

  // A unit filter over the whole dashboard. "All units" is not a global
  // override: it means everything you oversee, which is the whole church for
  // an org admin and their own units for a unit admin. Each card keeps the
  // church-wide figure beside the scoped one, so the global number stays
  // readable without a second mode to be in.
  const [unitFilter, setUnitFilter] = useState<string>("all")
  const unitId = unitFilter === "all" ? undefined : (unitFilter as Id<"units">)

  // The viewer's own calendar day, so "last Sunday" and "upcoming" follow it.
  const today = format(new Date(), "yyyy-MM-dd")
  const data = useQuery(api.dashboard.getDashboardData, { today, ...(unitId ? { unit_id: unitId } : {}) });

  const unitPicker = (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={unitFilter} onValueChange={setUnitFilter}>
        <SelectTrigger className="h-9 w-full sm:w-[240px]" disabled={unitsLoading}>
          <SelectValue placeholder={unitsLoading ? "Loading units…" : "All units"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All units</SelectItem>
          {ministries.map((unit) => (
            <SelectItem key={unit.id} value={String(unit.id)}>
              {unit.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ScopeBadge scope={data?.scope} />
      <p className="text-xs text-muted-foreground">
        {data?.unitName
          ? `Figures below count ${data.unitName} only, except your care tasks.`
          : "Counting everyone you oversee."}
      </p>
    </div>
  )

  if (data === undefined) {
    return (
      <div className="space-y-6">
        {unitPicker}
        <StatGrid>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:p-5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </StatGrid>
        <div className="grid gap-6 lg:grid-cols-7">
          <Card className="lg:col-span-4">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (data === null) {
    return (
      <div className="flex flex-col items-start gap-1 rounded-xl border border-destructive/30 bg-destructive/10 p-6">
        <h3 className="text-base font-semibold text-destructive-strong">Couldn't load the dashboard</h3>
        <p className="text-sm text-muted-foreground">
          This can happen when your account isn't fully set up yet or isn't linked to a church.
        </p>
      </div>
    )
  }

  const { stats, upcomingEvents, birthdayMembers } = data;
  // True when the headline figure covers less than the whole church, i.e. a
  // unit filter is on or the viewer is a unit admin. Drives the "of N
  // church-wide" context lines.
  const isNarrowed = stats.scopedMembersCount !== stats.totalMembers

  return <>
    <div className="mb-6">{unitPicker}</div>

    <StatGrid>
      <StatCard
        label={data.unitName ?? "Total members"}
        value={stats.scopedMembersCount}
        icon={Users}
        hint={`${stats.newMembersThisMonthCount > 0 ? `${stats.newMembersThisMonthCount} new this month` : "No new members this month"}${isNarrowed ? ` · of ${stats.totalMembers} church-wide` : ""}`}
        hintTone={stats.newMembersThisMonthCount > 0 ? "positive" : "neutral"}
      />

      {/* The most recent Sunday service on record, which may not be this
          week's, so its date is on the card. */}
      <StatCard
        label="Last Sunday service"
        value={stats.lastServiceDate ? stats.weeklyAttendance : "None yet"}
        icon={Church}
        hint={
          !stats.lastServiceDate
            ? "No Sunday service recorded yet"
            : [
                formatDay(stats.lastServiceDate),
                stats.attendanceChange === null
                  ? stats.previousServiceCount === null ? "No earlier service" : "None at the service before"
                  : `${stats.attendanceChange > 0 ? "+" : ""}${stats.attendanceChange}% on the one before`,
                stats.orgWeeklyAttendance !== stats.weeklyAttendance ? `of ${stats.orgWeeklyAttendance} church-wide` : null,
              ].filter(Boolean).join(" · ")
        }
        hintTone={
          stats.attendanceChange === null ? "neutral" : stats.attendanceChange >= 0 ? "positive" : "negative"
        }
      />

      <StatCard
        label={
          stats.unitsScope === 'sub-units'
            ? "Sub-units"
            : stats.unitsScope === 'led'
              ? "My units"
              : isAdmin
                ? "Active units"
                : "Members"
        }
        value={
          stats.unitsScope === 'organization' && !isAdmin
            ? stats.scopedMembersCount
            : stats.activeUnitsCount
        }
        icon={Users}
        hint={
          stats.unitsScope === 'sub-units'
            ? `Beneath ${data.unitName}`
            : stats.unitsScope === 'led'
              ? "Units you lead"
              : isAdmin
                ? "Units across the church"
                : `${stats.totalMembers > 0 ? Math.round((stats.scopedMembersCount / stats.totalMembers) * 100) : 0}% of total`
        }
      />

      <StatCard
        label="Upcoming events"
        value={stats.upcomingEventsCount}
        icon={Calendar}
        hint={`${stats.upcomingEventsCount > 0 ? `Next: ${sessionName(stats.nextEventName)}` : "Nothing scheduled"}${stats.orgUpcomingEventsCount !== stats.upcomingEventsCount ? ` · of ${stats.orgUpcomingEventsCount} church-wide` : ""}`}
      />
    </StatGrid>
    <div className="mt-6 grid gap-6 lg:grid-cols-7">
      <Card className="min-w-0 lg:col-span-4">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Attendance overview</CardTitle>
          <CardDescription>
            Attendance at every service, Sunday to Saturday, over the last 12 weeks
            {data.unitName && ` (${data.unitName} only)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="pl-0 sm:pl-2">
          <Overview unitId={unitId} today={today} />
        </CardContent>
      </Card>
      <Card className="min-w-0 lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Recent members</CardTitle>
          <CardDescription>
            The latest people added{data.unitName ? ` to ${data.unitName}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecentMembers unitId={unitId} />
        </CardContent>
      </Card>
    </div>
    <div className="mt-6">
      <MyCareTasksWidget />
    </div>

    <div className="mt-6">
      <CareImpactWidget unitId={unitId} />
    </div>

    <div className="mt-6">
      <AtRiskWidget unitId={unitId} />
    </div>

    <div className="mt-6">
      <BirthdayWidget members={birthdayMembers as any} />
    </div>

    {role === "super_admin" && (
      <div className="mt-6">
        <FinancialWidget
          onAddTransaction={() => {
            window.location.href = '/financial'
          }}
        />
      </div>
    )}

    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Upcoming events</CardTitle>
        <CardDescription>What's next on the church calendar</CardDescription>
        <CardAction>
          <Button asChild size="sm" variant="ghost">
            <Link to="/events">
              View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <UpcomingEvents events={upcomingEvents as any} />
      </CardContent>
    </Card>
  </>
}
