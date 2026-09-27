"use client"

import { useCallback, useState, useMemo } from "react"
import { Download, Mail, Phone, CalendarIcon, ArrowUpDown, UserCheck, Printer } from "lucide-react"

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
import { titleCase, formatDay } from "@/lib/display"
import { EmptyState } from "@/components/ui/empty-state"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useAnalytics } from "@/hooks/useAnalytics"
import { AnalyticsEventType } from "@/services/analytics/types"
import { toast } from "sonner"
import { downloadCsv, slugForFilename, toCsv } from "@/lib/csv"
import { MemberProfileDialog } from "./member-profile-dialog"
import type { Member } from "@/types/database"
import type { Id } from "../../convex/_generated/dataModel"
import { useOrganization } from "@/hooks/use-organization"
import { useUserRole } from "@/hooks/use-user-role"
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
  // Only administrators can create share links; the server enforces it.
  const { isAdmin } = useUserRole()

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

  // Absent members for the selected event, after every filter except search
  const filteredAbsent = useMemo(() => {
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

    return filteredMembers
  }, [selectedAttendanceRecord, selectedDate, allMembers, absenceFilter, unitId, statusFilter, calculateConsecutiveAbsences, effectiveEventType, eventTypes])

  // Present, counted over the same people as the absent list (event scope and
  // unit), not the whole church, so the two numbers add up.
  const presentInScope = useMemo(() => {
    if (!selectedAttendanceRecord) return 0
    const present = new Set(selectedAttendanceRecord.members)
    const eventUnitIds = (eventTypes.find((et) => et.value === effectiveEventType)?.unit_ids || []).map(String)
    return allMembers.filter((member) => {
      if (!present.has(member.id)) return false
      const ids = (member.unit_ids || []).map(String)
      if (eventUnitIds.length > 0 && !eventUnitIds.some((id) => ids.includes(id))) return false
      if (unitId && !ids.includes(unitId)) return false
      return true
    }).length
  }, [selectedAttendanceRecord, allMembers, eventTypes, effectiveEventType, unitId])

  // The search box narrows what is on screen; the count, the shared link and
  // the export describe the whole filtered list above.
  const absentMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return filteredAbsent
    return filteredAbsent.filter(
      (member) => member.name.toLowerCase().includes(q) || member.email?.toLowerCase().includes(q),
    )
  }, [filteredAbsent, searchQuery])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const sortRows = useCallback((rows: typeof filteredAbsent) => {
    if (!sortField) return rows
    return [...rows].sort((a, b) => {
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
  }, [sortField, sortDirection, selectedDate, calculateConsecutiveAbsences])

  const sortedMembers = useMemo(() => sortRows(absentMembers), [sortRows, absentMembers])
  const sortedAll = useMemo(() => sortRows(filteredAbsent), [sortRows, filteredAbsent])

  // Follow-up acts on the people on screen.
  const followUpEmails = useMemo(
    () => [...new Set(sortedMembers.map((m) => m.email?.trim()).filter((e): e is string => !!e))],
    [sortedMembers],
  )
  const followUpPhones = useMemo(
    () => [...new Set(sortedMembers.map((m) => m.phone?.trim()).filter((p): p is string => !!p))],
    [sortedMembers],
  )

  const printContactList = () => {
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
    const title = `${titleCase(selectedAttendanceRecord?.event_type_label ?? "")} · ${selectedAttendanceRecord ? formatDay(selectedAttendanceRecord.date) : ""}`
    const rows = sortedMembers.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.phone)}</td><td>${esc(m.email)}</td><td>${selectedDate ? calculateConsecutiveAbsences(m.id, selectedDate) : ""}</td><td>${esc(m.unit_names?.join(", "))}</td></tr>`).join("")
    const w = window.open("", "_blank")
    if (!w) {
      toast.error("Couldn't open the print view", { description: "Allow pop-ups for this site and try again." })
      return
    }
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Who was missing</title><style>body{font:14px system-ui,sans-serif;margin:32px;color:#1c1917}h1{font-size:20px;margin:0}p{color:#57534e;margin:4px 0 20px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e7e5e4;vertical-align:top}th{font-size:12px;color:#57534e}</style><h1>Who was missing</h1><p>${esc(title)}${unitName ? ` · ${esc(unitName)}` : ""} · ${sortedMembers.length} ${sortedMembers.length === 1 ? "person" : "people"}</p><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Missed in a row</th><th>Units</th></tr></thead><tbody>${rows}</tbody></table>`)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex flex-1 gap-4 flex-col sm:flex-row">
            <Input
              placeholder="Search members…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:max-w-[300px]"
            />
            <Select value={effectiveEventType || undefined} onValueChange={setEventType}>
              <SelectTrigger className="w-full sm:w-[180px]" disabled={eventTypesLoading || eventTypes.length === 0}>
                <SelectValue placeholder={eventTypesLoading ? "Loading…" : eventTypes.length === 0 ? "No event types" : "Choose an event type"} />
              </SelectTrigger>
              <SelectContent>
                {eventTypesLoading ? (
                  <SelectItem value="loading" disabled>Loading event types…</SelectItem>
                ) : eventTypes.length === 0 ? (
                  <SelectItem value="no-types" disabled>No event types yet</SelectItem>
                ) : (
                  eventTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {titleCase(type.label)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full sm:w-[180px] justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "d MMM yyyy") : <span>Choose a date</span>}
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
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Missed in a row" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any number missed</SelectItem>
                <SelectItem value="1+">Missed 1 or more in a row</SelectItem>
                <SelectItem value="2+">Missed 2 or more in a row</SelectItem>
                <SelectItem value="3+">Missed 3 or more in a row</SelectItem>
                <SelectItem value="5+">Missed 5 or more in a row</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
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
              if (filteredAbsent.length === 0) {
                toast.error("Nothing to export", { description: "The absent list is empty for this service and date." })
                return
              }

              // Create CSV content
              downloadCsv(
                `absent-members-${slugForFilename(effectiveEventType, "event")}-${format(selectedDate || new Date(), "yyyy-MM-dd")}.csv`,
                toCsv(
                  ["Name", "Email", "Phone", "Status", "Last attended", "Missed in a row", "Units"],
                  sortedAll.map((member) => [
                    member.name,
                    member.email || "",
                    member.phone || "",
                    titleCase(member.status),
                    member.lastAttendance ? formatDay(member.lastAttendance) : "Never recorded",
                    selectedDate ? calculateConsecutiveAbsences(member.id, selectedDate) : 0,
                    member.unit_names?.join("; ") || "None",
                  ]),
                ),
              )

              trackEvent(AnalyticsEventType.REPORT_EXPORTED, {
                report: 'absent_members',
                event_type: effectiveEventType,
                unit_filter: unitName || 'all',
                status_filter: statusFilter,
              });

              toast.success("Absent list downloaded")
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Export list
          </Button>
          {isAdmin && organization?._id && effectiveEventType && selectedDate && (
            <ShareAbsentLinkDialog
              organizationId={organization._id}
              eventType={effectiveEventType}
              eventTypeLabel={titleCase(eventTypes.find((t) => t.value === effectiveEventType)?.label ?? effectiveEventType)}
              date={selectedDate}
              unitId={unitId as Id<"units"> | undefined}
              unitName={unitName}
              statuses={STATUS_FILTERS.find((f) => f.value === statusFilter)?.statuses ?? ["active", "visitor", "inactive"]}
              minConsecutive={absenceFilter === "all" ? undefined : parseInt(absenceFilter)}
              count={filteredAbsent.length}
            />
          )}
        </div>

        {selectedAttendanceRecord && (
          <div className="text-sm text-muted-foreground">
            <strong className="text-foreground">{filteredAbsent.length}</strong> absent
            {unitName && <> in <strong className="text-foreground">{unitName}</strong></>} for{" "}
            <strong>{titleCase(selectedAttendanceRecord.event_type_label)}</strong> on{" "}
            <strong>{formatDay(selectedAttendanceRecord.date)}</strong>
            {". "}
            <strong className="text-foreground">{presentInScope}</strong> marked present
            {unitName && <> in {unitName}</>}.
            {searchQuery.trim() && <> Showing the {absentMembers.length} that match your search.</>}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border overflow-x-auto">
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
                  Last attended
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("consecutiveAbsences")}>
                <div className="flex items-center gap-1">
                  Missed in a row
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
                  Loading…
                </TableCell>
              </TableRow>
            ) : absentMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  {!selectedAttendanceRecord ? (
                    <EmptyState
                      icon={CalendarIcon}
                      className="py-6"
                      title="No attendance for this day"
                      description="Choose an event type and a date where attendance was taken."
                    />
                  ) : (
                    <EmptyState
                      icon={UserCheck}
                      className="py-6"
                      title="No one missing"
                      description="Everyone on this list was marked present, or the filters are hiding them."
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              sortedMembers.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left"
                      onClick={() => setViewingMember(member)}
                    >
                      <MemberAvatar name={member.name} src={member.avatar_url || member.avatar} />
                      <div className="font-medium">{member.name}</div>
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      {member.email && (
                        <div className="text-sm text-muted-foreground flex items-center">
                          <Mail className="mr-1 h-3 w-3" />
                          <span>{member.email}</span>
                        </div>
                      )}
                      {member.phone && (
                        <div className="text-sm text-muted-foreground flex items-center">
                          <Phone className="mr-1 h-3 w-3" />
                          <span>{member.phone}</span>
                        </div>
                      )}
                      {!member.email && !member.phone && (
                        <span className="text-sm text-muted-foreground">No contact details</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {member.status === "active" && (
                      <Badge className="bg-success/15 text-success-strong">Active</Badge>
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
                      ? formatDay(member.lastAttendance)
                      : <span className="text-muted-foreground">Never recorded</span>}
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
        <h3 className="text-base font-semibold">Follow up</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={followUpEmails.length === 0}
            onClick={() => {
              // Bcc, so no one sees anyone else's address.
              window.location.href = `mailto:?bcc=${followUpEmails.map(encodeURIComponent).join(",")}`
            }}
          >
            <Mail className="mr-2 h-4 w-4" />
            {followUpEmails.length === 0 ? "No emails on this list" : `Email ${followUpEmails.length}`}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={followUpPhones.length === 0}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(followUpPhones.join("\n"))
                toast.success(`${followUpPhones.length} phone ${followUpPhones.length === 1 ? "number" : "numbers"} copied`, {
                  description: "Paste them into your messaging app.",
                })
              } catch {
                toast.error("Couldn't copy the numbers")
              }
            }}
          >
            <Phone className="mr-2 h-4 w-4" />
            {followUpPhones.length === 0 ? "No phone numbers on this list" : `Copy ${followUpPhones.length} phone ${followUpPhones.length === 1 ? "number" : "numbers"}`}
          </Button>
          {organization?._id && (
            <AssignFollowUpDialog
              organizationId={organization._id}
              members={sortedMembers.map((m) => ({ id: m.id, name: m.name, household_id: m.household_id }))}
            />
          )}
          <Button size="sm" variant="outline" disabled={sortedMembers.length === 0} onClick={printContactList}>
            <Printer className="mr-2 h-4 w-4" />
            Print contact list
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
