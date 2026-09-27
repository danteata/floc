'use client'

import { useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAccessibleUnits } from "@/hooks/use-user-role"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import { useOrganization } from "@/hooks/use-organization"
import { ScopeBadge } from "@/components/scope-badge"
import { scopeSubtitle } from "@/lib/report-scope"
import { Info, Calendar, BarChart3, PieChartIcon, Filter } from "lucide-react"
import { titleCase } from "@/lib/display"

// Crimson-family palette (from the theme's --chart tokens) for multi-series
// charts. Use an explicit per-event-type color only when it's a valid hex;
// otherwise fall back to the palette so a series never renders as an invalid
// (black) fill.
const CHART_PALETTE = [
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-1)",
  "var(--chart-3)",
  "var(--chart-5)",
]
// One tooltip look for every chart here.
const TOOLTIP_STYLE = {
  backgroundColor: 'var(--popover)',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  fontSize: '12px',
  color: 'var(--popover-foreground)',
}
const TICK = { fill: 'var(--muted-foreground)', fontSize: 11 }
const legendLabel = (value: string) => <span className="text-xs text-muted-foreground ml-1">{titleCase(value)}</span>

const seriesColor = (color: string | undefined, index: number) =>
  color && color.startsWith("#") ? color : CHART_PALETTE[index % CHART_PALETTE.length]

export function AttendanceTrends() {
  const { context } = useOrganization()
  const { ministries, isLoading: unitsLoading } = useAccessibleUnits()
  const [unitFilter, setUnitFilter] = useState<string>("all")
  const unitName = ministries.find((u) => String(u.id) === unitFilter)?.name

  // The unit filter is applied server-side: every series is re-summed over that
  // unit's members, so the charts describe the unit rather than the whole org.
  const trendsData = useQuery(api.attendance.getTrends, {
    organization_id: context?.organization?._id as Id<"organizations">,
    ...(unitFilter === "all" ? {} : { unit_id: unitFilter as Id<"units"> }),
  })

  const unitPicker = (
    <Select value={unitFilter} onValueChange={setUnitFilter}>
      <SelectTrigger className="h-9 w-full sm:w-[220px]" disabled={unitsLoading}>
        <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
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
  )

  if (!trendsData) {
    return (
      <div className="space-y-6">
        {unitPicker}
        <div className="flex gap-4">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
        <Card className="p-4 md:p-6">
          <Skeleton className="h-[400px] w-full rounded-lg" />
        </Card>
      </div>
    )
  }

  const { weeklyData, monthlyData, eventComparisonData, activeEventTypes } = trendsData
  const hasWeeklyData = Array.isArray(weeklyData) && weeklyData.length > 0
  const hasMonthlyData = Array.isArray(monthlyData) && monthlyData.length > 0
  const hasComparisonData = Array.isArray(eventComparisonData) && eventComparisonData.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Attendance trends</h2>
          <p className="text-sm text-muted-foreground">
            {unitName
              ? `Every chart below counts ${unitName} members only.`
              : scopeSubtitle(trendsData.scope, "How attendance is changing, week by week and month by month.")}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          {unitPicker}
          <ScopeBadge scope={trendsData.scope} />
        </div>
      </div>

      <Tabs defaultValue="weekly" className="w-full space-y-6">
        <TabsList className="bg-muted/50 p-1 rounded-lg h-auto max-w-full justify-start flex-nowrap gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsTrigger value="weekly" className="h-8 shrink-0 grow-0 px-3 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Weekly</TabsTrigger>
          <TabsTrigger value="monthly" className="h-8 shrink-0 grow-0 px-3 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Monthly</TabsTrigger>
          <TabsTrigger value="comparison" className="h-8 shrink-0 grow-0 px-3 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Compare</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly" className="space-y-6 outline-none">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start gap-2">
                <Calendar className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base font-semibold">Weekly attendance</CardTitle>
                  <CardDescription className="text-sm">The last 11 weeks</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              {hasWeeklyData ? (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={TICK}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={TICK}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        iconType="circle"
                        formatter={legendLabel}
                      />
                      <Line
                        type="monotone"
                        dataKey="count"
                        name="Attendees"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "var(--primary)", strokeWidth: 2, stroke: "var(--background)" }}
                        activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--background)" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground bg-muted/30 rounded-lg border border-dashed border-border">
                  No attendance recorded in the last 11 weeks
                </div>
              )}
            </CardContent>
          </Card>

          <div>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Change from the week before</CardTitle>
                <CardDescription className="text-sm">Percentage up or down on the previous week</CardDescription>
              </CardHeader>
              <CardContent className="pb-4">
                {hasWeeklyData ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={weeklyData.slice(1).map((week, index) => ({
                          name: week.name,
                          growth: weeklyData[index].count > 0 ?
                            parseFloat((((week.count - weeklyData[index].count) / weeklyData[index].count) * 100).toFixed(1)) : 0
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={TICK}
                          dy={5}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={TICK}
                        />
                        <Tooltip
                          cursor={{ fill: 'var(--muted)' }}
                          contentStyle={TOOLTIP_STYLE}
                          separator=""
                          formatter={(value) => [`${value}% growth`, ""]}
                        />
                        <Bar
                          dataKey="growth"
                          name="Change"
                          fill="var(--primary)"
                          radius={[8, 8, 0, 0]}
                          barSize={32}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground bg-muted/30 rounded-lg border border-dashed border-border">
                    Record two weeks of attendance to see the change
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="monthly" className="space-y-6 outline-none">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start gap-2">
                <BarChart3 className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base font-semibold">Monthly attendance</CardTitle>
                  <CardDescription className="text-sm">Attendance over the last 12 months</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              {hasMonthlyData ? (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={TICK}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={TICK}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        name="Attendance"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorCount)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground bg-muted/30 rounded-lg border border-dashed border-border">
                  No attendance recorded in the last 12 months
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparison" className="space-y-6 outline-none">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start gap-2">
                <PieChartIcon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base font-semibold">Attendance by event type</CardTitle>
                  <CardDescription className="text-sm">How attendance compares across event types</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              {hasComparisonData ? (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={eventComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={TICK}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={TICK}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        iconType="circle"
                        formatter={legendLabel}
                      />
                      {activeEventTypes.map((eventType, index) => (
                        <Bar
                          key={eventType.id}
                          dataKey={eventType.label}
                          name={titleCase(eventType.label)}
                          fill={seriesColor(eventType.color, index)}
                          radius={[6, 6, 0, 0]}
                          stackId="a"
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground bg-muted/30 rounded-lg border border-dashed border-border">
                  Not enough attendance to compare yet
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Share by event type</CardTitle>
                <CardDescription className="text-sm">Each event type's share of attendance in the latest period</CardDescription>
              </CardHeader>
              <CardContent className="pb-4">
                {hasComparisonData ? (
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                        />
                        <Pie
                          data={activeEventTypes.map((et) => ({
                            name: titleCase(et.label),
                            value: eventComparisonData[eventComparisonData.length - 1][et.label] || 0
                          }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={110}
                          paddingAngle={8}
                          dataKey="value"
                        >
                          {activeEventTypes.map((et, index) => (
                            <Cell key={index} fill={seriesColor(et.color, index)} />
                          ))}
                        </Pie>
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          iconType="circle"
                          formatter={legendLabel}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground bg-muted/30 rounded-lg border border-dashed border-border">
                    No attendance recorded yet
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col justify-center rounded-xl border border-dashed border-border bg-muted/30 p-4 md:p-6">
              <div className="space-y-2 text-left">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-base font-semibold text-foreground">About these figures</h3>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                    These figures come from recorded services. The weekly and monthly views help you spot attendance trends over time.
                    {unitName
                      ? ` Only ${unitName} members are counted.`
                      : trendsData.scope?.isScoped && " Only members of the units you lead are counted."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
