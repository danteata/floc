"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Church, Users } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Overview } from "@/components/overview"
import { RecentMembers } from "@/components/recent-members"
import { UpcomingEvents } from "@/components/upcoming-events"
import { BirthdayWidget } from "@/components/birthday-widget"
import { FinancialWidget } from "@/components/financial-widget"
import { ServiceSummaryWidget } from "@/components/service-summary-widget"
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

export function DashboardContent() {
  const { isAdmin, role } = useUserRole()
  const { ministries, isLoading: unitsLoading } = useAccessibleUnits()

  // A unit filter over the whole dashboard. "All units" is not a global
  // override — it means everything you oversee, which is the whole church for
  // an org admin and their own units for a unit admin. Each card keeps the
  // church-wide figure beside the scoped one, so the global number stays
  // readable without a second mode to be in.
  const [unitFilter, setUnitFilter] = useState<string>("all")
  const unitId = unitFilter === "all" ? undefined : (unitFilter as Id<"units">)

  const data = useQuery(api.dashboard.getDashboardData, unitId ? { unit_id: unitId } : {});

  const unitPicker = (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={unitFilter} onValueChange={setUnitFilter}>
        <SelectTrigger className="h-9 w-full sm:w-[240px]" disabled={unitsLoading}>
          <SelectValue placeholder={unitsLoading ? "Loading units..." : "All units"} />
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
          ? `Every figure below counts ${data.unitName} only.`
          : "Counting everyone you oversee."}
      </p>
    </div>
  )

  if (data === undefined) {
    return (
      <div className="space-y-6">
        {unitPicker}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="card-neon">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <Skeleton className="h-4 w-20 bg-muted/30" />
                <Skeleton className="h-10 w-10 rounded-xl bg-muted/30" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2 bg-muted/30" />
                <Skeleton className="h-3 w-32 bg-muted/30" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7 mt-4">
          <Card className="col-span-4">
            <CardHeader>
              <Skeleton className="h-6 w-48 mb-2 bg-muted/30" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full bg-muted/30" />
            </CardContent>
          </Card>
          <Card className="col-span-3">
            <CardHeader>
              <Skeleton className="h-6 w-32 mb-2 bg-muted/30" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-10 w-10 rounded-full bg-muted/30" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-32 bg-muted/30" />
                      <Skeleton className="h-3 w-24 bg-muted/30" />
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
      <div className="p-6 bg-destructive/10 text-destructive rounded-xl border border-destructive/30 flex flex-col items-start gap-4 glass">
        <div>
          <h3 className="font-bold text-lg">Error loading dashboard</h3>
          <p className="text-sm opacity-80">We couldn't retrieve your dashboard data. This might happen if your account is not fully set up or linked to an organization.</p>
        </div>
      </div>
    )
  }

  const { stats, upcomingEvents, birthdayMembers, financialTransactions } = data;
  // True when the headline figure covers less than the whole church, i.e. a
  // unit filter is on or the viewer is a unit admin. Drives the "of N
  // church-wide" context lines.
  const isNarrowed = stats.scopedMembersCount !== stats.totalMembers

  return <>
    <div className="mb-6">{unitPicker}</div>

    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <Card
        className="overflow-hidden border-0 hover-lift group relative fade-in-up"
        style={{ animationDelay: "0ms" }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div className="h-1 bg-gradient-to-r from-primary via-primary to-primary/60"></div>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 pt-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground truncate">
            {data.unitName ?? "Total Members"}
          </CardTitle>
          <div className="p-2.5 bg-primary/15 rounded-xl group-hover:scale-110 transition-transform duration-300">
            <Users className="h-5 w-5 text-primary" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pb-6">
          <div className="text-4xl text-foreground tabular-nums tracking-tight">{stats.scopedMembersCount}</div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 bg-success/15 text-success px-3 py-1.5 rounded-full text-xs font-semibold border border-success/30">
              <span className="text-base leading-none">+</span>{stats.newMembersThisMonthCount} This Month
            </div>
            {isNarrowed && (
              <span className="text-xs text-muted-foreground">
                of {stats.totalMembers} church-wide
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card
        className="overflow-hidden border-0 hover-lift group relative fade-in-up"
        style={{ animationDelay: "60ms" }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div className="h-1 bg-gradient-to-r from-secondary via-secondary to-secondary/60"></div>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 pt-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground">Attendance</CardTitle>
          <div className="p-2.5 bg-secondary/30 rounded-xl group-hover:scale-110 transition-transform duration-300">
            <Church className="h-5 w-5 text-secondary-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pb-6">
          <div className="text-4xl text-foreground tabular-nums tracking-tight">{stats.weeklyAttendance}</div>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border ${stats.attendanceChange >= 0
              ? 'bg-success/15 text-success border-success/30'
              : 'bg-destructive/15 text-destructive border-destructive/30'
              }`}>
              {stats.attendanceChange >= 0 ? '↗' : '↘'} {Math.abs(stats.attendanceChange)}% vs Last Week
            </div>
            {stats.orgWeeklyAttendance !== stats.weeklyAttendance && (
              <span className="text-xs text-muted-foreground">
                of {stats.orgWeeklyAttendance} church-wide
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card
        className="overflow-hidden border-0 hover-lift group relative fade-in-up"
        style={{ animationDelay: "120ms" }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div className="h-1 bg-gradient-to-r from-accent via-accent to-accent/60"></div>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 pt-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            {stats.unitsScope === 'sub-units'
              ? "Sub-units"
              : stats.unitsScope === 'led'
                ? "My Units"
                : isAdmin
                  ? "Active Groups"
                  : "Members"
            }
          </CardTitle>
          <div className="p-2.5 bg-accent/20 rounded-xl group-hover:scale-110 transition-transform duration-300">
            <Users className="h-5 w-5 text-accent" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pb-6">
          <div className="text-4xl text-foreground tabular-nums tracking-tight">
            {stats.unitsScope === 'organization' && !isAdmin
              ? stats.scopedMembersCount
              : stats.activeUnitsCount
            }
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {stats.unitsScope === 'sub-units'
              ? `Beneath ${data.unitName}`
              : stats.unitsScope === 'led'
                ? "Units you lead"
                : isAdmin
                  ? "Organization Units"
                  : `${stats.totalMembers > 0 ? Math.round((stats.scopedMembersCount / stats.totalMembers) * 100) : 0}% of Total`
            }
          </p>
        </CardContent>
      </Card>

      <Card
        className="overflow-hidden border-0 hover-lift group relative fade-in-up"
        style={{ animationDelay: "180ms" }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div className="h-1 bg-gradient-to-r from-primary via-primary/80 to-primary/60"></div>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 pt-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground">Events</CardTitle>
          <div className="p-2.5 bg-primary/15 rounded-xl group-hover:scale-110 transition-transform duration-300">
            <Calendar className="h-5 w-5 text-primary" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pb-6">
          <div className="text-4xl text-foreground tabular-nums tracking-tight">{stats.upcomingEventsCount}</div>
          <p className="text-xs text-muted-foreground truncate">
            Next: {stats.nextEventName}
          </p>
          {stats.orgUpcomingEventsCount !== stats.upcomingEventsCount && (
            <p className="text-xs text-muted-foreground">
              of {stats.orgUpcomingEventsCount} church-wide
            </p>
          )}
        </CardContent>
      </Card>
    </div>
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7 mt-6">
      <Card className="col-span-4 overflow-hidden fade-in-up" style={{ animationDelay: "240ms" }}>
        <CardHeader className="border-b border-border/30 bg-muted/10">
          <CardTitle className="text-lg font-semibold">Attendance Overview</CardTitle>
          <CardDescription>
            Weekly attendance for the past 3 months
            {data.unitName && ` — ${data.unitName} only`}
          </CardDescription>
        </CardHeader>
        <CardContent className="pl-2 pt-6">
          <Overview unitId={unitId} />
        </CardContent>
      </Card>
      <Card className="col-span-3 overflow-hidden fade-in-up" style={{ animationDelay: "300ms" }}>
        <CardHeader className="border-b border-border/30 bg-muted/10">
          <CardTitle className="text-lg font-semibold">Recent Members</CardTitle>
          <CardDescription>Newest additions to the fellowship</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <RecentMembers />
        </CardContent>
      </Card>
    </div>
    <div className="mt-6">
      <MyCareTasksWidget />
    </div>

    <div className="mt-6">
      <CareImpactWidget />
    </div>

    <div className="mt-6">
      <AtRiskWidget />
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

    {role === "super_admin" && (
      <div className="mt-6">
        <ServiceSummaryWidget
          summaries={[]}
        />
      </div>
    )}

    <div className="mt-6">
      <UpcomingEvents events={upcomingEvents as any} />
    </div>
  </>
}
