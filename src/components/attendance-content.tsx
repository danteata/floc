'use client'

import { useState } from "react"
import { Download, Calendar, Users, History, UserMinus, PlusCircle, RefreshCw, TrendingUp, Target, Activity, BarChart3, ChevronDown, QrCode, Lock, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AttendanceForm } from "@/components/attendance-form"
import { AttendanceHistory } from "@/components/attendance-history"
import { AbsentMembers } from "@/components/absent-members"
import { ServiceMetadataSummaryDialog } from "@/components/service-metadata-summary-dialog"
import { CheckInQrPanel } from "@/components/check-in/check-in-qr-panel"
import { cn } from "@/lib/utils"
import { titleCase, formatDay } from "@/lib/display"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { StatCard, StatGrid } from "@/components/ui/stat-card"
import { useQuery, useMutation } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { useAnalytics } from "@/hooks/useAnalytics"
import { AnalyticsEventType } from "@/services/analytics/types"
import { useUserRole, useManagedMembers, useAccessibleUnits } from "@/hooks/use-user-role"
import { ScopeBadge } from "@/components/scope-badge"
import { PageHeader } from "@/components/ui/page-header"
import { hasCapability } from "@/lib/permissions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function AttendanceContent() {
  const { role } = useUserRole();
  // Managing check-in sessions is allowed for org admins and unit-level admins
  // alike; mirrors the backend requireWriteAccess check (convex/scope.ts).
  const canManageCheckIn = hasCapability(role, "command_center");
  const { members, isLoading: membersLoading } = useManagedMembers();
  const { ministries, isLoading: filtersLoading } = useAccessibleUnits();
  const { trackEvent } = useAnalytics();

  // One unit filter for the whole page. It drives the metric cards, the
  // registry you mark attendance in, the history counts and the absent list —
  // previously each tab filtered its own table while the cards above kept
  // reporting org-wide totals.
  const [unitFilter, setUnitFilter] = useState<string>("all")
  const unitId = unitFilter === "all" ? undefined : (unitFilter as Id<"units">)
  const unitName = ministries.find((u) => String(u.id) === unitFilter)?.name

  const stats = useQuery(api.attendance.getStats, unitId ? { unit_id: unitId } : {});
  const attendanceRecords = useQuery(api.attendance.listWithDetails, unitId ? { unit_id: unitId } : {});
  const eventTypes = useQuery(api.event_types.getAll, {});
  const loading = stats === undefined || filtersLoading || membersLoading;
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Service metadata dialog state
  const [showMetadataDialog, setShowMetadataDialog] = useState(false)
  const [editingMetadata, setEditingMetadata] = useState<any>(null)

  // Mutations
  const recordMetadata = useMutation(api.attendance.recordFullAttendance); // Placeholder if we merge

  const refreshStats = async () => {
    setIsRefreshing(true)
    // Convex automatically refreshes, but we can simulate a delay or trigger a background task if needed
    setTimeout(() => setIsRefreshing(false), 500);
  }

  const handleExportAttendance = async (attendanceId: string) => {
    try {
      // This would need to be implemented as a Convex function
      // For now, we'll use a simple approach with the existing data
      const record = attendanceRecords?.find((r: any) => r._id === attendanceId)
      if (!record) {
        console.error("Attendance record not found")
        return
      }

      // Create simple CSV with available data. Under a unit filter `count` is
      // that unit's headcount, so the org-wide figure is carried alongside it
      // rather than the two silently swapping places.
      const scoped = record.org_count !== undefined && record.org_count !== record.count
      const headers = scoped
        ? ["Date", "Event Type", `${unitName ?? "In-scope"} Attendance`, "Organization Attendance"]
        : ["Date", "Event Type", "Attendance Count"]
      const values = scoped
        ? [`"${record.date}"`, `"${record.event_type_label || "Attendance"}"`, record.count, record.org_count]
        : [`"${record.date}"`, `"${record.event_type_label || "Attendance"}"`, record.count]
      const csvContent = [headers.join(","), values.join(",")].join("\n")

      // Download CSV
      const blob = new Blob([csvContent], { type: "text/csv" })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `attendance-${record.date}-${record.event_type_label || "record"}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      trackEvent(AnalyticsEventType.REPORT_EXPORTED, {
        report: 'attendance',
        date: record.date,
        event_type: record.event_type_label,
      });
    } catch (error) {
      console.error("Export failed:", error)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attendance"
        description="Who came, service by service, and who has been missing."
        actions={
          <>
            <ScopeBadge scope={stats?.scope} />
            <Button
              variant="outline"
              size="sm"
              onClick={refreshStats}
              disabled={isRefreshing}
              className="h-8"
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Export
                  <ChevronDown className="ml-2 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                {attendanceRecords && attendanceRecords.length > 0 ? (
                  attendanceRecords.slice(0, 10).map((record: any) => (
                    <DropdownMenuItem
                      key={record._id}
                      onClick={() => handleExportAttendance(record._id)}
                      className="flex flex-col items-start gap-1 p-3"
                    >
                      <div className="font-medium">{titleCase(record.event_type_label) || "Attendance"}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDay(record.date)} · {record.count} {record.count === 1 ? "person" : "people"}
                      </div>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled>
                    No attendance to export yet
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Page-level scope control. Sits above the cards because it governs
          them as well as every tab below. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Select value={unitFilter} onValueChange={setUnitFilter}>
          <SelectTrigger className="h-9 w-full sm:w-[240px]" disabled={filtersLoading}>
            <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <SelectValue placeholder={filtersLoading ? "Loading units…" : "All units"} />
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
        <p className="text-xs text-muted-foreground">
          {unitName
            ? `Everything below counts ${unitName} only.`
            : "Counting every member you look after. Pick a unit to narrow every number on this page."}
        </p>
      </div>

      {/* On mobile, the primary action (Record tab below) comes before these
          stat cards — reordered via `order-*` so the page doesn't force a
          long scroll past six stacked cards before reaching it. Desktop
          keeps the original stats-first order (order-none). */}
      {loading ? (
        <div className="order-2 md:order-none grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-3 xl:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <StatGrid className="order-2 md:order-none lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label={unitName ?? (stats?.scope?.isScoped ? "Your members" : "Total members")}
            value={stats?.totalActiveMembers || 0}
            icon={Users}
          />
          <StatCard label="This week" value={stats?.thisWeekTotal || 0} icon={Calendar} />
          {/* With nothing recorded yet this week the change is always -100%,
              which reads as a collapse rather than "not taken yet". */}
          <StatCard
            label="Change on last week"
            value={(stats?.thisWeekTotal || 0) === 0 ? "No data yet" : `${(stats?.weeklyGrowthRate || 0) > 0 ? "+" : ""}${(stats?.weeklyGrowthRate || 0).toFixed(1)}%`}
            icon={TrendingUp}
            hint={(stats?.thisWeekTotal || 0) === 0 ? "No attendance recorded this week yet" : "Week on week"}
            hintTone={(stats?.thisWeekTotal || 0) === 0 ? "neutral" : (stats?.weeklyGrowthRate || 0) >= 0 ? "positive" : "negative"}
          />
          <StatCard label="Attendance rate" value={`${(stats?.attendanceRate || 0).toFixed(1)}%`} icon={Target} />
          <StatCard label="Active days" value={stats?.recentActivityDays || 0} icon={Activity} />
          <StatCard label="Services recorded" value={stats?.totalRecords || 0} icon={BarChart3} />
        </StatGrid>
      )}

      <Tabs defaultValue="record" className="order-1 md:order-none w-full space-y-6">
        <TabsList className="bg-muted/50 p-1 rounded-lg h-auto w-full max-w-full sm:w-fit justify-start flex-nowrap gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            {
              value: "record",
              icon: <PlusCircle className="h-3.5 w-3.5" />,
              label: "Record"
            },
            {
              value: "checkin",
              icon: <QrCode className="h-3.5 w-3.5" />,
              label: "Check-in"
            },
            {
              value: "history",
              icon: <History className="h-3.5 w-3.5" />,
              label: "History"
            },
            {
              value: "absent",
              icon: <UserMinus className="h-3.5 w-3.5" />,
              label: "Absent"
            },
            {
              value: "metadata",
              icon: <BarChart3 className="h-3.5 w-3.5" />,
              label: "Summaries"
            }
          ].map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className={cn(
                "h-8 shrink-0 grow-0 px-3 rounded-md text-sm gap-1.5",
                "data-[state=active]:bg-background",
                "data-[state=active]:text-foreground",
                "data-[state=active]:shadow-sm",
                "text-muted-foreground"
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <TabsContent value="record" className="space-y-4 outline-none">
            <AttendanceForm
              availableMembers={members}
              unitFilter={unitFilter}
            />
          </TabsContent>

          <TabsContent value="checkin" className="space-y-4 outline-none">
            {!canManageCheckIn ? (
              <Card>
                <CardContent>
                  <EmptyState
                    icon={Lock}
                    title="Check-in is for admins"
                    description="Ask an admin to open a check-in session for you."
                  />
                </CardContent>
              </Card>
            ) : !eventTypes || eventTypes.length === 0 ? (
              <Card>
                <CardContent>
                  <EmptyState
                    icon={QrCode}
                    title="No event types yet"
                    description="Add an event type (such as Sunday service) and you can open check-in for it here."
                  />
                </CardContent>
              </Card>
            ) : (
              <CheckInQrPanel eventTypes={eventTypes} />
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4 outline-none">
            <AttendanceHistory
              unitId={unitId}
              unitName={unitName}
            />
          </TabsContent>

          <TabsContent value="absent" className="space-y-4 outline-none">
            <AbsentMembers unitId={unitId} unitName={unitName} />
          </TabsContent>

          <TabsContent value="metadata" className="space-y-4 outline-none">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 md:p-6 bg-muted/30 rounded-xl border border-border/50">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Service summaries</h2>
                <p className="text-sm text-muted-foreground">
                  Record the message, who preached, headcounts and first-timers for each service.
                </p>
              </div>
              <Button
                onClick={() => setShowMetadataDialog(true)}
                className="h-9"
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                New summary
              </Button>
            </div>

            <Card>
              <CardContent>
                <EmptyState
                  icon={BarChart3}
                  title="No service summaries yet"
                  description="Add one after a service to keep its details alongside the attendance."
                />
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      <ServiceMetadataSummaryDialog
        open={showMetadataDialog}
        onOpenChange={(open) => {
          setShowMetadataDialog(open)
          if (!open) setEditingMetadata(null)
        }}
        summary={editingMetadata}
        onSave={async (_summaryData: unknown) => {
          setShowMetadataDialog(false);
        }}
        events={[]}
        members={members.map(m => ({ id: m.id, name: m.name, units: m.unit_names || [] }))}
      />
    </div>
  )
}
