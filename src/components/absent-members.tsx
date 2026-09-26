"use client"

import { useCallback, useState, useMemo } from "react"
import { Download, Mail, Phone, CalendarIcon, ArrowUpDown } from "lucide-react"

import { MemberAvatar } from "@/components/ui/member-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { format } from "date-fns"
import { useEventTypes } from "@/hooks/use-event-types"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useAnalytics } from "@/hooks/useAnalytics"
import { AnalyticsEventType } from "@/services/analytics/types"
import { toast } from "sonner"
import { MemberProfileDialog } from "./member-profile-dialog"
import type { Member } from "@/types/database"
import { useOrganization } from "@/hooks/use-organization"
import { ShareAbsentLinkDialog } from "@/components/share-absent-link-dialog"
import { AssignFollowUpDialog } from "@/components/assign-follow-up-dialog"

type AttendanceRecord = {
  _id: string
  date: string
  event_type_value?: string
  event_type_label?: string
  members: string[]
}

type MemberRow = Member & {
  id: string
  unit_names?: string[]
  lastAttendance?: string | null
}

function getLastAttendanceForMember(memberId: string, attendanceRecords: AttendanceRecord[]) {
  let lastAttendance: string | null = null

  for (const record of attendanceRecords) {
    if (!record.members.includes(memberId)) continue
    if (!lastAttendance || record.date > lastAttendance) {
      lastAttendance = record.date
    }
  }

  return lastAttendance
}

// Same default as the attendance registry: an inactive member is absent from
// every service by definition, so leaving them in buries the people worth
// following up on — and pads the exported follow-up list.
const STATUS_FILTERS: { value: string; label: string; statuses: string[] | null }[] = [
  { value: "active-visitor", label: "Active & visitors", statuses: ["active", "visitor"] },
  { value: "active", label: "Active only", statuses: ["active"] },
  { value: "visitor", label: "Visitors only", statuses: ["visitor"] },
  { value: "inactive", label: "Inactive only", statuses: ["inactive"] },
  { value: "all", label: "All statuses", statuses: null },
]

interface AbsentMembersProps {
  /** Page-level unit filter (a unit id), or undefined for all units. */
  unitId?: string
  unitName?: string
}

export function AbsentMembers({ unitId, unitName }: AbsentMembersProps = {}) {
  const { trackEvent } = useAnalytics()
  const [searchQuery, setSearchQuery] = useState("")
  const [eventType, setEventType] = useState("")
  const [absenceFilter, setAbsenceFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("active-visitor")
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [viewingMember, setViewingMember] = useState<MemberRow | null>(null)
  const { eventTypes, isLoading: eventTypesLoading } = useEventTypes();
  const effectiveEventType = eventType || eventTypes[0]?.value || ""
  const { organization } = useOrganization()

  // Convex Queries
  const rawMembersData = useQuery(api.members.getAll, {})
  const membersData = useMemo(() => (rawMembersData || []) as unknown as MemberRow[], [rawMembersData])
  const rawAttendanceRecords = useQuery(api.attendance.listWithMembers, {})
  const attendanceRecords = useMemo(() => (rawAttendanceRecords || []) as AttendanceRecord[], [rawAttendanceRecords])
  const allMembers = useMemo(() => membersData.map((m) => ({
    ...m,
    id: String(m._id || m.id || ""),
    _id: m._id,
    lastAttendance: m.lastAttendance ?? getLastAttendanceForMember(String(m._id || m.id || ""), attendanceRecords),
  })), [membersData, attendanceRecords])

  const loading = rawMembersData === undefined || rawAttendanceRecords === undefined;

  // Find the attendance record for the selected date and event type
  const selectedAttendanceRecord = useMemo(() => {
    if (!selectedDate || !effectiveEventType) return null
    const selectedDateStr = format(selectedDate, "yyyy-MM-dd")
    return attendanceRecords.find((record) =>
      record.event_type_value === effectiveEventType &&
      record.date === selectedDateStr
    )
  }, [selectedDate, effectiveEventType, attendanceRecords]);

  // Calculate consecutive absences for each member
  const calculateConsecutiveAbsences = useCallback((memberId: string, baseDate: Date) => {
    // Find the current event type config to check unit scoping
    const currentEventType = eventTypes.find((et) => et.value === effectiveEventType)
    const eventUnitIds = currentEventType?.unit_ids || []

    // Get the member's unit IDs for scoping check
    const member = allMembers.find((m) => m.id === memberId)
    const memberUnitIds = member?.unit_ids || []
    const memberUnitIdSet = new Set(memberUnitIds.map(String))

    // Check if this event applies to this member based on unit scoping
    // If event has no unit scoping, it applies to all members
    // If event has unit scoping, member must be in one of those units
    const eventAppliesToMember = eventUnitIds.length === 0 ||
      eventUnitIds.some((uid: string) => memberUnitIdSet.has(uid))

    if (!eventAppliesToMember) return 0 // Event doesn't apply to this member

    // Get all attendance records for the selected event type, sorted by date descending
    const eventRecords = attendanceRecords
      .filter((record) => record.event_type_value === effectiveEventType)
      .sort((a, b) => b.date.localeCompare(a.date))

    // Filter to records on or before the selected date
    const baseDateStr = format(baseDate, "yyyy-MM-dd")
    const recordsOnOrBeforeBase = eventRecords
      .filter((record) => record.date <= baseDateStr)

    if (recordsOnOrBeforeBase.length === 0) return 0

    // Find the member's most recent attendance record
    const memberRecords = recordsOnOrBeforeBase
      .filter((record) => record.members.includes(memberId))

    const lastAttended = memberRecords[0] // Most recent (sorted desc)

    // Count consecutive absences: records after last attendance where member is absent
    let consecutiveAbsences = 0
    for (const record of recordsOnOrBeforeBase) {
      // Stop if we've reached a record the member attended
      if (record._id === lastAttended?._id) break

      // This record is after the member's last attendance - count as absence
      consecutiveAbsences++
    }

    return consecutiveAbsences
  }, [allMembers, attendanceRecords, effectiveEventType, eventTypes])

  // Get absent members for the selected event
  const absentMembers = useMemo(() => {
    if (!selectedAttendanceRecord || !selectedDate) return []

    // Find the current event type config to check unit scoping
    const currentEventType = eventTypes.find((et) => et.value === effectiveEventType)
    const eventUnitIds = currentEventType?.unit_ids || []

    // Filter members who were not in the attendees list
    // Also apply unit scoping: only include members who are in the event's scoped units
    const absentMemberIds = allMembers
      .filter((member) => {
        // Check if member was absent
        if (selectedAttendanceRecord.members.includes(member.id)) return false

        // Apply unit scoping: if event has unit_ids, member must be in one of those units
        if (eventUnitIds.length > 0) {
          const memberUnitIds = member.unit_ids || []
          const memberUnitIdSet = new Set(memberUnitIds.map(String))
          const isInScopedUnit = eventUnitIds.some((uid: string) => memberUnitIdSet.has(uid))
          if (!isInScopedUnit) return false
        }

        return true
      })
      .map((member) => member.id)

    // Apply consecutive absences filter
    let filteredMembers = allMembers.filter((member) => absentMemberIds.includes(member.id))

    if (absenceFilter !== "all") {
      const threshold = parseInt(absenceFilter.replace("+", ""))
      filteredMembers = filteredMembers.filter((member) => {
        const absences = calculateConsecutiveAbsences(member.id, selectedDate)
        return absences >= threshold
      })
    }

    // Apply the page-level unit filter (by id — unit names are not unique)
    if (unitId) {
      filteredMembers = filteredMembers.filter((member) =>
        (member.unit_ids || []).some((id: unknown) => String(id) === unitId),
      )
    }

    // Apply status filter
    const allowedStatuses = STATUS_FILTERS.find(f => f.value === statusFilter)?.statuses ?? null
    if (allowedStatuses) {
      filteredMembers = filteredMembers.filter((member) => allowedStatuses.includes(member.status))
    }

    // Apply search filter
    if (searchQuery) {
      filteredMembers = filteredMembers.filter(
        (member) =>
          member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          member.email?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    }

    return filteredMembers
  }, [selectedAttendanceRecord, selectedDate, allMembers, absenceFilter, searchQuery, unitId, statusFilter, calculateConsecutiveAbsences, effectiveEventType, eventTypes])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const sortedMembers = useMemo(() => {
    if (!sortField) return absentMembers
    return [...absentMembers].sort((a, b) => {
      let comparison: number
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name)
          break
        case "status":
          comparison = a.status.localeCompare(b.status)
          break
        case "lastAttendance": {
          const aDate = a.lastAttendance || ""
          const bDate = b.lastAttendance || ""
          comparison = aDate.localeCompare(bDate)
          break
        }
        case "consecutiveAbsences": {
          const aAbs = selectedDate ? calculateConsecutiveAbsences(a.id, selectedDate) : 0
          const bAbs = selectedDate ? calculateConsecutiveAbsences(b.id, selectedDate) : 0
          comparison = aAbs - bAbs
          break
        }
        default:
          return 0
      }
      return sortDirection === "asc" ? comparison : -comparison
    })
  }, [absentMembers, sortField, sortDirection, selectedDate, calculateConsecutiveAbsences])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-1 gap-4 flex-col sm:flex-row">
            <Input
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-[300px]"
            />
            <Select value={effectiveEventType || undefined} onValueChange={setEventType}>
              <SelectTrigger className="w-[180px]" disabled={eventTypesLoading || eventTypes.length === 0}>
                <SelectValue placeholder={eventTypesLoading ? "Loading..." : eventTypes.length === 0 ? "No event types" : "Select event type"} />
              </SelectTrigger>
              <SelectContent>
                {eventTypesLoading ? (
                  <SelectItem value="loading" disabled>Loading event types...</SelectItem>
                ) : eventTypes.length === 0 ? (
                  <SelectItem value="no-types" disabled>No event types configured</SelectItem>
                ) : (
                  eventTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-[180px] justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Select value={absenceFilter} onValueChange={setAbsenceFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by absences" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Absences</SelectItem>
                <SelectItem value="1+">1+ Consecutive</SelectItem>
                <SelectItem value="2+">2+ Consecutive</SelectItem>
                <SelectItem value="3+">3+ Consecutive</SelectItem>
                <SelectItem value="5+">5+ Consecutive</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Member status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (absentMembers.length === 0) {
                toast.error("No absent members to export")
                return
              }

              // Create CSV content
              const headers = ["Name", "Email", "Phone", "Status", "Last Attendance", "Consecutive Absences", "Units"]
              const csvContent = [
                headers.join(","),
                ...absentMembers.map((member) => {
                  const absences = selectedDate ? calculateConsecutiveAbsences(member.id, selectedDate) : 0
                  return [
                    `"${member.name}"`,
                    `"${member.email || ''}"`,
                    `"${member.phone || ''}"`,
                    `"${member.status}"`,
                    `"${member.lastAttendance ? format(new Date(member.lastAttendance), "MMM dd, yyyy") : 'N/A'}"`,
                    absences,
                    `"${member.unit_names?.join('; ') || 'None'}"`
                  ].join(",")
                })
              ].join("\n")

              // Download CSV
              const blob = new Blob([csvContent], { type: "text/csv" })
              const url = window.URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = `absent-members-${effectiveEventType}-${format(selectedDate || new Date(), "yyyy-MM-dd")}.csv`
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
              window.URL.revokeObjectURL(url)

              trackEvent(AnalyticsEventType.REPORT_EXPORTED, {
                report: 'absent_members',
                event_type: effectiveEventType,
                unit_filter: unitName || 'all',
                status_filter: statusFilter,
              });

              toast.success("Export completed!")
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Export List
          </Button>
          {organization?._id && effectiveEventType && selectedDate && (
            <ShareAbsentLinkDialog
              organizationId={organization._id}
              eventType={effectiveEventType}
              eventTypeLabel={eventTypes.find((t) => t.value === effectiveEventType)?.label ?? effectiveEventType}
              date={selectedDate}
            />
          )}
        </div>

        {selectedAttendanceRecord && (
          <div className="text-sm text-muted-foreground">
            <strong className="text-foreground">{absentMembers.length}</strong> absent
            {unitName && <> in <strong className="text-foreground">{unitName}</strong></>} for{" "}
            <strong>{selectedAttendanceRecord.event_type_label}</strong> on{" "}
            <strong>{format(new Date(selectedAttendanceRecord.date), "PPP")}</strong>
            {" — "}
            <strong className="text-foreground">{selectedAttendanceRecord.members.length}</strong> marked present
          </div>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("name")}>
                <div className="flex items-center gap-1">
                  Member
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("status")}>
                <div className="flex items-center gap-1">
                  Status
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("lastAttendance")}>
                <div className="flex items-center gap-1">
                  Last Attendance
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("consecutiveAbsences")}>
                <div className="flex items-center gap-1">
                  Consecutive Absences
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead>Units</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : absentMembers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  {!selectedAttendanceRecord
                    ? "Select an event to view absent members"
                    : "No absent members found for this event"}
                </TableCell>
              </TableRow>
            ) : (
              sortedMembers.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <button
                      className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left"
                      onClick={() => setViewingMember(member)}
                    >
                      <MemberAvatar name={member.name} src={member.avatar_url || member.avatar} />
                      <div className="font-medium">{member.name}</div>
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <div className="text-sm text-muted-foreground flex items-center">
                        <Mail className="mr-1 h-3 w-3" />
                        <span>{member.email}</span>
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center">
                        <Phone className="mr-1 h-3 w-3" />
                        <span>{member.phone}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {member.status === "active" && (
                      <Badge className="bg-success">Active</Badge>
                    )}
                    {member.status === "inactive" && (
                      <Badge
                        variant="outline"
                        className="border-warning text-warning-strong"
                      >
                        Inactive
                      </Badge>
                    )}
                    {member.status === "visitor" && (
                      <Badge variant="secondary">Visitor</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {member.lastAttendance
                      ? format(new Date(member.lastAttendance), "MMM dd, yyyy")
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const absences = selectedDate ? calculateConsecutiveAbsences(member.id, selectedDate) : 0
                      return (
                        <Badge
                          variant={
                            absences >= 4
                              ? "destructive"
                              : absences >= 2
                                ? "outline"
                                : "secondary"
                          }
                          className={
                            absences >= 2 && absences < 4
                              ? "text-warning-strong border-warning"
                              : ""
                          }
                        >
                          {absences}
                        </Badge>
                      )
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(member.unit_names?.length ?? 0) > 0 ? (
                        member.unit_names?.map((min: string, index: number) => (
                          <Badge key={index} variant="outline">
                            {min}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">None</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm">Follow-up Actions</h3>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline">
            Send Email to All
          </Button>
          <Button size="sm" variant="outline">
            Send Text Message
          </Button>
          {organization?._id && (
            <AssignFollowUpDialog
              organizationId={organization._id}
              members={sortedMembers.map((m) => ({ id: m.id, name: m.name, household_id: m.household_id }))}
            />
          )}
          <Button size="sm" variant="outline">
            Print Contact List
          </Button>
        </div>
      </div>

      <MemberProfileDialog
        member={viewingMember}
        open={!!viewingMember}
        onOpenChange={(open) => { if (!open) setViewingMember(null) }}
      />
    </div>
  )
}
