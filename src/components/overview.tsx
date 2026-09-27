"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { BarChart3 } from "lucide-react"

interface OverviewProps {
  className?: string
  /** Page-level unit filter, so the chart matches the cards above it. */
  unitId?: Id<"units">
  /** The viewer's local day ("yyyy-MM-dd"), so the last bar is their current week. */
  today?: string
}

export function Overview({ className, unitId, today }: OverviewProps) {
  const data = useQuery(api.dashboard.getAttendanceTrends, {
    weeks: 12,
    ...(today ? { today } : {}),
    ...(unitId ? { unit_id: unitId } : {}),
  });

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center h-[350px]">
        <div className="space-y-4 w-full px-4">
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  // Every week is returned (zero when nothing was recorded), so "empty" means
  // no attendance in any of them.
  if (!data.some((week) => week.total > 0)) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No attendance recorded yet"
        description="Check members in at a service or event and the weekly totals will show here."
        className="h-[350px]"
      />
    )
  }

  const chartData = data;

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData}>
          <XAxis
            dataKey="name"
            stroke="var(--muted-foreground)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
          />
          <YAxis
            stroke="var(--muted-foreground)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value}`}
            tickMargin={10}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--popover)',
              color: 'var(--popover-foreground)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              padding: '8px 12px',
            }}
            labelStyle={{ color: 'var(--muted-foreground)', marginBottom: '4px' }}
          />
          <Bar
            dataKey="total"
            name="Attendance"
            fill="var(--primary)"
            radius={[4, 4, 0, 0]}
            className="hover:opacity-80 transition-opacity"
            maxBarSize={32}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}