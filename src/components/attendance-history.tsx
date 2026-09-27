'use client'

import { useState } from 'react'
import { Download, Eye, Search, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useEventTypes } from '@/hooks/use-event-types'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { AttendeesDialog } from './attendees-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { titleCase, formatDay } from '@/lib/display'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

/** One row of `attendance.listWithDetails`. */
type AttendanceRow = {
  _id: string
  date: string
  count: number
  org_count: number
  notes?: string
  event_type_label?: string
  event_type_value?: string
}

interface AttendanceHistoryProps {
  /** Page-level unit filter (a unit id); headcounts are scoped to it server-side. */
  unitId?: Id<'units'>
  unitName?: string
}

export function AttendanceHistory({ unitId, unitName }: AttendanceHistoryProps) {
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [viewingRecord, setViewingRecord] = useState<any | null>(null)
  const [eventType, setEventType] = useState('all')
  const [search, setSearch] = useState('')
  const { eventTypes, isLoading: eventTypesLoading } = useEventTypes()

  // Convex Query. The unit filter is applied server-side: an attendance record
  // belongs to the whole org, so filtering it by unit means recounting its
  // attendees, not dropping rows.
  const rawAttendanceData = useQuery(
    api.attendance.listWithDetails,
    unitId ? { unit_id: unitId } : {},
  );
  const attendanceData = rawAttendanceData || [];
  const loading = rawAttendanceData === undefined;

  const handleViewAttendees = (record: any) => {
    setViewingRecord(record)
    setViewDialogOpen(true)
  }

  // True once any record's scoped headcount differs from the org total, i.e.
  // the viewer is a unit admin, or a unit filter is narrowing the counts.
  const hasScopedCounts = attendanceData.some(
    (record) => record.org_count !== record.count,
  )

  const filteredRecords = attendanceData.filter((record: AttendanceRow) => {
    if (eventType !== 'all' && record.event_type_value !== eventType) {
      return false
    }
    const term = search.trim().toLowerCase()
    if (term) {
      const haystack = [record.date, record.notes, record.event_type_label]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(term)) return false
    }
    return true
  })

  const totalAttendances = filteredRecords.reduce(
    (sum: number, record: AttendanceRow) => sum + (record.count || 0),
    0,
  )

  const handleExportCsv = () => {
    const escape = (val: unknown) => {
      const str = val === null || val === undefined ? '' : String(val)
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
    }
    const headers = unitName
      ? ['Date', 'Event Type', `${unitName} attendees`, 'Organization attendees', 'Notes']
      : ['Date', 'Event Type', 'Attendees', 'Notes']

    const rows = filteredRecords.map((record: AttendanceRow) =>
      unitName
        ? [record.date, record.event_type_label || record.event_type_value || '', record.count, record.org_count, record.notes || '']
        : [record.date, record.event_type_label || record.event_type_value || '', record.count, record.notes || ''],
    )

    const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-history-${unitName ? `${unitName.toLowerCase().replace(/\s+/g, '-')}-` : ''}${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <Card>
      <CardHeader className="p-4 pb-2 md:p-6 md:pb-2">
        <CardTitle className="text-lg font-semibold text-foreground">Attendance history</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          {unitName
            ? `Every service at which at least one ${unitName} member was marked present.`
            : hasScopedCounts
              ? "Every service at which at least one of your members was marked present."
              : "Every service you have recorded."}
          {hasScopedCounts && " Headcounts show your members, then the whole church."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-2 md:p-6 md:pt-2">
        <div className="space-y-6">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by note or date…"
                className="pl-11 h-11 bg-background max-w-md"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-row gap-3 items-center flex-wrap">
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="w-full sm:w-[200px] h-11 bg-background">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="py-2.5">All types</SelectItem>
                  {eventTypesLoading ? (
                    <SelectItem value="loading" disabled>Loading…</SelectItem>
                  ) : (
                    eventTypes.map((eventType: any) => (
                      <SelectItem key={eventType.value} value={eventType.value}>
                        {titleCase(eventType.label)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={filteredRecords.length === 0}
                className="h-11 px-6"
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>

          {!loading && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center rounded-lg bg-muted text-muted-foreground px-3 py-1.5">
                {filteredRecords.length} record{filteredRecords.length === 1 ? '' : 's'}
                {filteredRecords.length !== attendanceData.length && ` of ${attendanceData.length}`}
              </span>
              <span className="inline-flex items-center rounded-lg bg-primary/10 text-primary px-3 py-1.5 font-semibold">
                {totalAttendances} {totalAttendances === 1 ? "person" : "people"} counted in all
              </span>
            </div>
          )}

          <div className="rounded-xl border border-border overflow-x-auto bg-card">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="text-xs text-muted-foreground pl-6 py-3">Date</TableHead>
                  <TableHead className="text-xs text-muted-foreground py-3">Event type</TableHead>
                  <TableHead className="text-xs text-muted-foreground py-3 text-center">Present</TableHead>
                  <TableHead className="text-xs text-muted-foreground py-3 pr-6">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i} className="border-muted">
                      <TableCell className="pl-6"><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12 mx-auto" /></TableCell>
                      <TableCell className="pr-6">
                        <div className="flex gap-4 items-center justify-between">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-8 w-8 rounded-lg" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-32 text-center"
                    >
                      <EmptyState
                        icon={FileText}
                        className="py-6"
                        title={attendanceData.length === 0 ? 'No attendance recorded yet' : 'No services match'}
                        description={attendanceData.length === 0 ? 'Take attendance in the Record tab and it will appear here.' : 'Try a different search or event type.'}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((record) => (
                    <TableRow key={record._id} className="hover:bg-muted/50 transition-colors border-border last:border-0">
                      <TableCell className="pl-6 py-4 whitespace-nowrap font-medium text-foreground">
                        {formatDay(record.date)}
                      </TableCell>
                      <TableCell className="py-4 text-foreground">
                        {titleCase(record.event_type_label || record.event_type_value) || 'Attendance'}
                      </TableCell>
                      <TableCell className="py-4 text-center">
                        <Badge
                          variant="outline"
                          className="bg-muted text-foreground tabular-nums"
                          title={
                            record.org_count !== record.count
                              ? `${record.count} of your members · ${record.org_count} across the church`
                              : undefined
                          }
                        >
                          {record.count}
                          {record.org_count !== record.count && (
                            <span className="text-muted-foreground/60 font-normal">
                              /{record.org_count}
                            </span>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4 pr-6">
                        <div className="flex gap-4 items-center justify-between">
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {record.notes || <span className="text-muted-foreground/70">No notes</span>}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewAttendees(record)}
                            className="h-9 w-9"
                            aria-label="See who was there"
                            title="See who was there"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
      <AttendeesDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        record={viewingRecord}
        unitId={unitId}
      />
    </Card>
  )
}
