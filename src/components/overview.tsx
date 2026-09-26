"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Skeleton } from "@/components/ui/skeleton"

interface OverviewProps {
  className?: string
  /** Page-level unit filter, so the chart matches the cards above it. */
  unitId?: Id<"units">
}

export function Overview({ className, unitId }: OverviewProps) {
  const data = useQuery(api.dashboard.getAttendanceTrends, {
    weeks: 12,
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

  const chartData = data.length > 0 ? data : [{ name: 'No Data', total: 0 }];

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
            fill="var(--primary)"
            radius={[4, 4, 0, 0]}
            className="hover:opacity-80 transition-opacity"
            barSize={32}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}