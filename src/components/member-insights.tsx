'use client'

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MemberAvatar } from "@/components/ui/member-avatar"
import { StatCard, StatGrid } from "@/components/ui/stat-card"
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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
          <h2 className="text-lg font-semibold text-foreground">Member insights</h2>
          <p className="text-sm text-muted-foreground">
            {scopeSubtitle(insights.scope, "How members are attending and who might need a visit")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScopeBadge scope={insights.scope} />
          {overview.trendingUp ? (
            <Badge className="bg-success/15 text-success-strong">
              <TrendingUp className="h-3 w-3 mr-1" />
              Growing
            </Badge>
          ) : (
            <Badge className="bg-warning/15 text-warning-strong">
              <TrendingDown className="h-3 w-3 mr-1" />
              Needs attention
            </Badge>
          )}
        </div>
      </div>

      <StatGrid>
        <StatCard label="Members" value={overview.totalMembers.toLocaleString()} icon={Users} />
        <StatCard label="Active" value={overview.activeMembers.toLocaleString()} icon={UserCheck} />
        <StatCard label="Engagement" value={`${overview.engagementRate}%`} icon={Activity} />
        <StatCard label="New this month" value={`+${overview.newMembersThisMonth}`} icon={UserPlus} />
      </StatGrid>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Monthly attendance
            </CardTitle>
            <CardDescription className="text-sm">
              Different people who came each month, and the average per gathering
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
                      name="People who came"
                      stroke="var(--primary)"
                      fillOpacity={1}
                      fill="url(#colorAttendees)"
                    />
                    <Line
                      type="monotone"
                      dataKey="avgAttendance"
                      name="Average attendance"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                No attendance recorded yet
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-muted-foreground" />
              Demographics
            </CardTitle>
            <CardDescription className="text-sm">
              Members by age group and gender
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData && (chartData.ageData.length > 0 || chartData.genderData.length > 0) ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground text-center mb-2">Age groups</p>
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
                      <Badge key={i} variant="outline" className="font-normal">
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
                      <Badge key={i} variant="outline" className="font-normal">
                        {item.name}: {item.value}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                No ages or genders recorded yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            Not seen recently
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
                    <MemberAvatar name={member.name} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground">Not seen in 60 days</p>
                    </div>
                  </div>
                  <Badge className="bg-warning/15 text-warning-strong">
                    Inactive
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <UserCheck className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
              Everyone has attended in the last 60 days
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
