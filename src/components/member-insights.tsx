'use client'

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useOrganization } from "@/hooks/use-organization"
import { ScopeBadge } from "@/components/scope-badge"
import { scopeSubtitle } from "@/lib/report-scope"
import {
  Users,
  UserCheck,
  UserX,
  TrendingUp,
  TrendingDown,
  UserPlus,
  AlertTriangle,
  Activity,
  BarChart3,
  PieChartIcon,
} from "lucide-react"
import { Id } from "../../convex/_generated/dataModel"

// The theme's chart ramp, so the charts follow the brand and both themes.
const COLORS = ['var(--chart-4)', 'var(--chart-2)', 'var(--chart-1)', 'var(--chart-5)', 'var(--chart-3)']

export function MemberInsights() {
  const { context } = useOrganization()
  const insights = useQuery(api.members.getInsights, {
    organization_id: context?.organization?._id as Id<"organizations">
  })

  const chartData = useMemo(() => {
    if (!insights) return null
    return {
      retention: insights.retentionData.map(d => ({
        name: d.month,
        attendees: d.uniqueAttendees,
        avgAttendance: d.avgAttendance
      })),
      ageData: Object.entries(insights.demographics.ageGroups)
        .filter(([_, value]) => value > 0)
        .map(([name, value], index) => ({
          name: name === 'unspecified' ? 'Unknown' : name,
          value,
          fill: COLORS[index % COLORS.length]
        })),
      genderData: Object.entries(insights.demographics.gender)
        .filter(([_, value]) => value > 0)
        .map(([name, value], index) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          value,
          fill: COLORS[index % COLORS.length]
        }))
    }
  }, [insights])

  if (!insights) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-[350px] rounded-xl" />
          <Skeleton className="h-[350px] rounded-xl" />
        </div>
      </div>
    )
  }

  const { overview, potentiallyInactive } = insights

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Member Insights</h2>
          <p className="text-sm text-muted-foreground">
            {scopeSubtitle(insights.scope, "Engagement patterns and membership analytics")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScopeBadge scope={insights.scope} />
          {overview.trendingUp ? (
            <Badge variant="outline" className="bg-success/10 text-success-strong border-success/20">
              <TrendingUp className="h-3 w-3 mr-1" />
              Growing
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-warning/10 text-warning-strong border-warning/20">
              <TrendingDown className="h-3 w-3 mr-1" />
              Needs Attention
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{overview.totalMembers}</p>
                <p className="text-xs text-muted-foreground">Total Members</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-success/10 text-success-strong rounded-lg flex items-center justify-center">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{overview.activeMembers}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-warning/10 text-warning-strong rounded-lg flex items-center justify-center">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{overview.engagementRate}%</p>
                <p className="text-xs text-muted-foreground">Engagement</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-info/10 text-info-strong rounded-lg flex items-center justify-center">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">+{overview.newMembersThisMonth}</p>
                <p className="text-xs text-muted-foreground">New This Month</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/50 rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Monthly Engagement
            </CardTitle>
            <CardDescription className="text-sm">
              Unique attendees vs average attendance
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData && chartData.retention.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData.retention}>
                    <defs>
                      <linearGradient id="colorAttendees" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--popover)',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        fontSize: '12px'
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="attendees"
                      name="Unique Attendees"
                      stroke="var(--primary)"
                      fillOpacity={1}
                      fill="url(#colorAttendees)"
                    />
                    <Line
                      type="monotone"
                      dataKey="avgAttendance"
                      name="Avg Attendance"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                No attendance data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-muted-foreground" />
              Demographics
            </CardTitle>
            <CardDescription className="text-sm">
              Age and gender distribution
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData && (chartData.ageData.length > 0 || chartData.genderData.length > 0) ? (
              <div className="grid grid-cols-2 gap-4 h-[300px]">
                <div>
                  <p className="text-xs text-muted-foreground text-center mb-2">Age Groups</p>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={chartData.ageData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {chartData.ageData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-2 mt-1">
                    {chartData.ageData.map((item, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">
                        {item.name}: {item.value}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground text-center mb-2">Gender</p>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={chartData.genderData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {chartData.genderData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-2 mt-1">
                    {chartData.genderData.map((item, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">
                        {item.name}: {item.value}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                No demographic data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning-strong" />
            Inactive Members
          </CardTitle>
          <CardDescription className="text-sm">
            Members who haven't attended in the last 60 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {potentiallyInactive.length > 0 ? (
            <div className="space-y-2">
              {potentiallyInactive.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground">No recent activity</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-warning-strong border-warning/30">
                    Inactive
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <UserCheck className="h-8 w-8 mx-auto mb-2 text-success-strong" />
              All members are actively engaged
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
