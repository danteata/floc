"use client"

import { useState, useEffect } from "react"
import { CalendarIcon, Search, RefreshCw, CalendarDays, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { MemberAvatar } from "@/components/ui/member-avatar"
import { cn } from "@/lib/utils"
import { titleCase } from "@/lib/display"
import { format } from "date-fns"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "./ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { useEventTypes } from "@/hooks/use-event-types"
import { useQuery, useMutation } from "convex/react"
import { useAnalytics } from "@/hooks/useAnalytics"
import { AnalyticsEventType } from "@/services/analytics/types"
import { api } from "../../convex/_generated/api"
import { Id } from "../../convex/_generated/dataModel"
import { MemberProfileDialog } from "@/components/member-profile-dialog"
import type { Member } from "@/types/database"

// Which member statuses the registry shows. Inactive members are excluded by
// default — they are the bulk of the scrolling when marking a service, and
// leaving them in silently padded exported lists too. Visitors stay visible:
// a visitor at a service is exactly the person you need to be able to tick.
const STATUS_FILTERS: { value: string; label: string; statuses: string[] | null }[] = [
  { value: "active-visitor", label: "Active & visitors", statuses: ["active", "visitor"] },
  { value: "active", label: "Active only", statuses: ["active"] },
  { value: "visitor", label: "Visitors only", statuses: ["visitor"] },
  { value: "inactive", label: "Inactive only", statuses: ["inactive"] },
  { value: "all", label: "All statuses", statuses: null },
]

interface AttendanceFormProps {
  availableMembers?: any[]
  /**
   * Unit id, or "all". Owned by the page (see attendance-content) so this
   * registry, the metric cards and the other tabs all describe one slice —
   * hence no unit dropdown of its own down here.
   */
  unitFilter?: string
  onSuccess?: () => void
}

export function AttendanceForm({
  availableMembers = [],
  unitFilter = "all",
  onSuccess
}: AttendanceFormProps) {
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [attendanceType, setAttendanceType] = useState("")
  const [selectedEventId, setSelectedEventId] = useState<string>("auto-create")
  const [notes, setNotes] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [viewingMember, setViewingMember] = useState<Member | null>(null)
  const { toast } = useToast();
  const { eventTypes, isLoading: eventTypesLoading } = useEventTypes();
  const { trackEvent } = useAnalytics();

  // Filters
  const [statusFilter, setStatusFilter] = useState("active-visitor")

  // Convex Mutations
  const recordFullAttendance = useMutation(api.attendance.recordFullAttendance)

  // Find event type ID from value
  const selectedEventType = eventTypes.find(et => et.value === attendanceType);
  const eventTypeId = selectedEventType?.id as Id<"event_types"> | undefined;

  // Fetch events for the selected date
  const eventsForDate = useQuery(
    api.events.getByDate,
    date ? { date: format(date, "yyyy-MM-dd") } : "skip"
  );

  // Filter events by selected event type
  const filteredEvents = eventsForDate?.filter((e: any) =>
    !attendanceType || e.event_type_value === attendanceType
  ) || [];

  // Fetch existing attendance for the selected date and type
  const existingAttendance = useQuery(
    api.attendance.getByDateAndType,
    date && eventTypeId ? { date: format(date, "yyyy-MM-dd"), event_type_id: eventTypeId } : "skip"
  );

  const existingMembers = useQuery(
    api.attendance.getAttendanceWithMembers,
    existingAttendance ? { attendanceId: existingAttendance._id } : "skip"
  );

  // Set default event type
  useEffect(() => {
    if (!eventTypesLoading && eventTypes.length > 0 && !attendanceType) {
      setAttendanceType(eventTypes[0].value);
    }
  }, [eventTypes, eventTypesLoading, attendanceType]);

  // Load the ticks and notes of the service being edited, once per service.
  // Keyed by which record this is (date, type, id), not by every reactive
  // update of it: a QR check-in arriving while you tick names must not wipe
  // the ticks you haven't saved yet. Done during render, React's pattern for
  // resetting state when an input changes.
  const dateKey = date ? format(date, "yyyy-MM-dd") : ""
  const recordKey = `${dateKey}|${eventTypeId ?? ""}|${existingAttendance?._id ?? "new"}`
  const recordReady =
    existingAttendance === null || (existingAttendance !== undefined && existingMembers !== undefined)
  const [loadedRecordKey, setLoadedRecordKey] = useState<string | null>(null)
  if (recordReady && loadedRecordKey !== recordKey) {
    setLoadedRecordKey(recordKey)
    setSelectedMembers(existingAttendance ? (existingMembers ?? []).map((m: any) => m._id) : [])
    setNotes(existingAttendance?.notes ?? "")
  }

  // Reset selected event when date or type changes
  useEffect(() => {
    setSelectedEventId("auto-create");
  }, [date, attendanceType]);

  const handleSelectMember = (id: string) => {
    if (selectedMembers.includes(id)) {
      setSelectedMembers(selectedMembers.filter((memberId) => memberId !== id))
    } else {
      setSelectedMembers([...selectedMembers, id])
    }
  }

  const allowedStatuses = STATUS_FILTERS.find(f => f.value === statusFilter)?.statuses ?? null

  const filteredMembers = availableMembers.filter((member) => {
    const matchesSearch =
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (member.email && member.email.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesUnit =
      unitFilter === "all" ||
      (member.unit_ids || []).some((id: string) => String(id) === unitFilter)

    // Someone already marked present survives the status filter: an inactive
    // member recorded by QR check-in, or ticked before the filter was applied,
    // must stay visible or you could neither see nor unmark them. Unit and
    // search still apply — those are "show me this slice" questions, and the
    // tally below reports how many marked members they are hiding.
    const matchesStatus =
      !allowedStatuses ||
      allowedStatuses.includes(member.status) ||
      selectedMembers.includes(member.id)

    return matchesSearch && matchesUnit && matchesStatus
  })

  // Counts, so the numbers you would otherwise tally by hand are on screen.
  const visibleIds = filteredMembers.map((m) => m.id)
  const selectedVisibleCount = visibleIds.filter((id) => selectedMembers.includes(id)).length
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length
  const hiddenSelectedCount = selectedMembers.length - selectedVisibleCount

  // Acts on the visible rows only: selections outside the current filters are
  // left alone instead of being wiped by a "select all" the user aimed at the
  // handful of rows in front of them.
  const handleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedMembers(selectedMembers.filter((id) => !visibleIds.includes(id)))
    } else {
      setSelectedMembers(Array.from(new Set([...selectedMembers, ...visibleIds])))
    }
  }

  const handleSaveAttendance = async () => {
    if (!date || !eventTypeId) {
      toast({
        variant: "destructive",
        title: "Choose a date and service",
        description: "Pick the service and the date before saving.",
      })
      return
    }

    if (selectedMembers.length === 0) {
      toast({
        variant: "destructive",
        title: "No one marked present",
        description: "Tick at least one member before saving.",
      })
      return
    }

    setIsSaving(true)
    try {
      const formattedDate = format(date, "yyyy-MM-dd")
      await recordFullAttendance({
        date: formattedDate,
        event_type_id: eventTypeId,
        event_id: selectedEventId !== "auto-create" ? (selectedEventId as Id<"events">) : undefined,
        notes,
        member_ids: selectedMembers as Id<"members">[],
      });

      trackEvent(AnalyticsEventType.ATTENDANCE_MARKED, {
        date: formattedDate,
        event_type_id: eventTypeId,
        member_count: selectedMembers.length,
        has_notes: !!notes,
      });

      toast({
        title: "Attendance saved",
        description: `${selectedMembers.length} ${selectedMembers.length === 1 ? "member" : "members"} marked present.`,
      })

      if (onSuccess) onSuccess()
    } catch (error: any) {
      console.error('Error saving attendance:', error)
      toast({
        variant: "destructive",
        title: "Couldn't save attendance",
        description: error.message || "Try again in a moment.",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="p-4 pb-2 md:p-6 md:pb-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold text-foreground">Take attendance</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">Choose the service and date, then mark who was there.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="h-9 self-start md:self-auto"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-4 pt-2 md:p-6 md:pt-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Service or event type</Label>
              <Select value={attendanceType || undefined} onValueChange={setAttendanceType}>
                <SelectTrigger className="h-11 bg-background">
                  <SelectValue placeholder={eventTypesLoading ? "Loading…" : "Choose a type"} />
                </SelectTrigger>
                <SelectContent>
                  {eventTypes.map((eventType) => (
                    <SelectItem key={eventType.value} value={eventType.value}>
                      {titleCase(eventType.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full h-11 justify-start font-normal text-foreground bg-background",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-3 h-4 w-4 text-muted-foreground" />
                    {date ? format(date, "d MMM yyyy") : <span>Choose a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(selectedDate) => {
                      if (selectedDate && selectedDate > new Date()) return;
                      setDate(selectedDate)
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Event {filteredEvents.length > 0 && `(${filteredEvents.length} on this day)`}
              </Label>
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger className="h-11 bg-background">
                  <SelectValue placeholder={filteredEvents.length > 0 ? "Choose an event (optional)" : "Create one when saving"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto-create">
                    <span className="text-muted-foreground">Create a new event when saving</span>
                  </SelectItem>
                  {filteredEvents.map((event: any) => (
                    <SelectItem key={event._id} value={event._id}>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        <span>{titleCase(event.title)}</span>
                        {event.time && <span className="text-muted-foreground text-xs">({event.time})</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-4 space-y-4">
            <Label className="text-xs text-muted-foreground">Members</Label>
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex-1">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-11 bg-background">
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
              <div className="relative flex-[2]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by name or email…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-11 h-11 bg-background"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleSelectAll}
                className="h-11 px-6 shrink-0"
              >
                {allVisibleSelected
                  ? `Clear ${visibleIds.length}`
                  : `Select all (${visibleIds.length})`}
              </Button>
            </div>

            {/* Running tallies: the counts you would otherwise get by
                scrolling the table and counting ticks by hand. */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 text-primary px-3 py-1.5 font-semibold">
                <Users className="h-3.5 w-3.5" />
                {selectedMembers.length} present
              </span>
              <span className="inline-flex items-center rounded-lg bg-muted text-muted-foreground px-3 py-1.5">
                {visibleIds.length - selectedVisibleCount} not marked yet
              </span>
              <span className="inline-flex items-center rounded-lg bg-muted text-muted-foreground px-3 py-1.5">
                Showing {visibleIds.length} of {availableMembers.length} {availableMembers.length === 1 ? "member" : "members"}
              </span>
              {hiddenSelectedCount > 0 && (
                <span className="inline-flex items-center rounded-lg bg-muted text-muted-foreground px-3 py-1.5">
                  {hiddenSelectedCount} present but hidden by filters
                </span>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="w-[60px] pl-6">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={handleSelectAll}
                        aria-label="Mark everyone shown as present"
                      />
                    </TableHead>
                    <TableHead className="min-w-[200px] text-xs text-muted-foreground">Member</TableHead>
                    <TableHead className="hidden md:table-cell text-xs text-muted-foreground text-center">Phone</TableHead>
                    <TableHead className="hidden md:table-cell text-xs text-muted-foreground pl-4">Units</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-32 text-center">
                        <EmptyState
                          icon={Search}
                          className="py-6"
                          title="No members match"
                          description={
                            allowedStatuses
                              ? `Showing ${allowedStatuses.join(" and ")} members. Change the status filter or search to see more.`
                              : "Try a different name or email."
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMembers.map((member) => (
                      <TableRow key={member.id} className="hover:bg-muted/50 transition-colors border-border last:border-0">
                        <TableCell className="pl-6 py-4">
                          <Checkbox
                            checked={selectedMembers.includes(member.id)}
                            onCheckedChange={() => handleSelectMember(member.id)}
                            aria-label="Mark present"
                          />
                        </TableCell>
                        <TableCell className="py-4">
                          <button
                            type="button"
                            onClick={() => setViewingMember(member)}
                            className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
                          >
                            <MemberAvatar name={member.name} src={member.avatar_url || member.avatar} className="border-2 border-background" />
                            <div className="flex flex-col">
                              <span className="flex items-center gap-2">
                                <span className="font-medium text-foreground underline-offset-2 hover:underline">{member.name}</span>
                                {/* Only flagged when it is not the ordinary case, so a
                                    row that survived the status filter because it is
                                    already marked present reads as deliberate. */}
                                {member.status && member.status !== "active" && (
                                  <Badge
                                    variant="outline"
                                    className="capitalize text-muted-foreground"
                                  >
                                    {member.status}
                                  </Badge>
                                )}
                              </span>
                              {/* Phone/email, not the raw internal id: this is the only
                                  contact info visible on mobile, since the Contact column
                                  is hidden below md. */}
                              <span className="text-xs text-muted-foreground md:hidden">
                                {member.phone || member.email || "No contact info"}
                              </span>
                            </div>
                          </button>
                        </TableCell>
                        <TableCell className="hidden md:table-cell py-4 text-center">
                          <span className="text-sm text-muted-foreground">{member.phone || '–'}</span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell py-4 pl-4">
                          <div className="flex flex-wrap gap-1.5">
                            {(member.unit_names || member.units || []).map((m: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-muted-foreground">
                                {m}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-2 pt-4">
            <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
            <Input
              placeholder="Anything worth remembering about this service…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-11 bg-background"
            />
          </div>
        </CardContent>
        <CardFooter className="p-4 md:p-6 border-t border-border justify-end">
          <Button
            onClick={handleSaveAttendance}
            disabled={isSaving}
            className="h-11 w-full px-8 sm:w-auto sm:min-w-[240px]"
          >
            {isSaving ? (
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Saving…
              </div>
            ) : (
              <div className="flex items-center gap-2">
                Save attendance ({selectedMembers.length})
              </div>
            )}
          </Button>
        </CardFooter>
      </Card>

      <MemberProfileDialog
        member={viewingMember}
        open={!!viewingMember}
        onOpenChange={(open) => !open && setViewingMember(null)}
      />
    </div>
  )
}
