'use client'

import { useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Calendar,
  Church,
  Heart,
  Users,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Search,
  Filter
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from "@/components/ui/page-header"
import { StatCard, StatGrid } from "@/components/ui/stat-card"
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { UpcomingEvents } from '@/components/upcoming-events'
import { EventDialog } from '@/components/event-dialog'
import { useTerminology, getUnitLabels } from '@/hooks/use-terminology'
import { useEventTypes } from '@/hooks/use-event-types'
import { format, isAfter, isBefore, startOfDay } from 'date-fns'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Id } from '../../convex/_generated/dataModel'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export function EventsContent() {
  const { toast } = useToast()
  // Use empty object to trigger backend user-based org lookup, or could inject org ID
  const events = useQuery(api.events.list, {}) || []
  const removeMutation = useMutation(api.events.remove)

  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<any | null>(null)

  // Table view state
  const [searchQuery, setSearchQuery] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all') // all, upcoming, past
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(10)

  const { terminology, isLoading: terminologyLoading } = useTerminology()
  const { eventTypes } = useEventTypes()
  const unitLabels = getUnitLabels(terminology)

  const isLoading = events === undefined || terminologyLoading

  // Filtering and pagination logic
  const filteredEvents = (events || []).filter((event: any) => {
    const matchesSearch =
      searchQuery === '' ||
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.event_type_label?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesEventType =
      eventTypeFilter === 'all' ||
      event.event_type_value === eventTypeFilter

    const today = startOfDay(new Date())
    const eventDate = startOfDay(new Date(event.date))
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'upcoming' &&
        (isAfter(eventDate, today) ||
          eventDate.getTime() === today.getTime())) ||
      (statusFilter === 'past' && isBefore(eventDate, today))

    return matchesSearch && matchesEventType && matchesStatus
  })

  // Sort by date ascending
  filteredEvents.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage)
  const paginatedEvents = filteredEvents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const [eventToDelete, setEventToDelete] = useState<any | null>(null)

  const handleDeleteEvent = async (eventId: string) => {
    try {
      await removeMutation({ id: eventId as Id<"events"> })
      toast({ title: "Deleted", description: "Event removed successfully" })
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    } finally {
      setEventToDelete(null)
    }
  }

  const handleAddEvent = () => {
    setEditingEvent(null)
    setIsEventDialogOpen(true)
  }

  const handleEditEvent = (event: any) => {
    setEditingEvent({
      ...event,
      id: event._id // For compatibility with existing EventDialog if it uses 'id'
    })
    setIsEventDialogOpen(true)
  }

  if (isLoading) {
    return (
      <div className="container p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="space-y-6">
          <div className="flex space-x-1 mb-6">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-24" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container px-4 py-8 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader
        title="Events"
        description="Services and events, and when each one runs."
        actions={
          <>
            <Button
              onClick={handleAddEvent}
              className="bg-primary text-primary-foreground shadow-soft hover:shadow-soft-lg transition-all rounded-lg"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Event
            </Button>
          </>
        }
      />

      <Tabs defaultValue="overview" className="space-y-8">
        <TabsList className="bg-muted/50 p-1 rounded-xl w-full md:w-auto inline-flex">
          <TabsTrigger
            value="overview"
            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-6 transition-all"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="all-events"
            className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-6 transition-all"
          >
            All Events
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-8">
          <StatGrid>
            <StatCard
              label="Total events"
              value={events.length.toString()}
              icon={Calendar}
            />
            <StatCard
              label={`${unitLabels.single} events`}
              value={events.filter((e: any) => e.event_type_label?.toLowerCase().includes(terminology.unit_term.toLowerCase())).length.toString()}
              icon={Users}
            />
            <StatCard
              label="Services"
              value={events.filter((e: any) => e.event_type_value === 'sunday-service').length.toString()}
              icon={Church}
            />
            <StatCard
              label="Active"
              value={events.filter((e: any) => e.active).length.toString()}
              icon={Heart}
            />
          </StatGrid>

          <div className="rounded-xl overflow-hidden shadow-soft border border-border/50 bg-card p-6">
            <UpcomingEvents events={events as any} onEditEvent={handleEditEvent} />
          </div>
        </TabsContent>

        <TabsContent value="all-events" className="space-y-6">
          <Card className="shadow-soft hover:shadow-soft-lg transition-all rounded-xl border border-border/50">
            <CardHeader className="bg-muted/30 pb-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                Filter Events
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2 relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    placeholder="Search events..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-background border-input-border rounded-lg"
                  />
                </div>
                <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Event Type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg shadow-lg border-border/50">
                    <SelectItem value="all">All Types</SelectItem>
                    {eventTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg shadow-lg border-border/50">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="past">Past</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-xl overflow-hidden shadow-soft border border-border/50 bg-card">
            <Table>
              <TableHeader className="bg-muted/40 hover:bg-muted/40 border-b border-border/50">
                <TableRow>
                  <TableHead className="font-semibold text-muted-foreground pl-6">Event</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Type</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Date</TableHead>
                  <TableHead className="font-semibold text-muted-foreground">Status</TableHead>
                  <TableHead className="text-right font-semibold text-muted-foreground pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEvents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No events found matching your criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedEvents.map((event: any) => {
                    const today = startOfDay(new Date())
                    const eventDate = startOfDay(new Date(event.date))
                    const isUpcoming = isAfter(eventDate, today) || eventDate.getTime() === today.getTime()

                    return (
                      <TableRow key={event._id} className="hover:bg-muted/30 border-b border-border/50 transition-colors">
                        <TableCell className="pl-6">
                          <div className="flex flex-col gap-1">
                            <span className="font-semibold text-sm text-foreground">{event.title}</span>
                            {event.description && (
                              <span className="text-xs text-muted-foreground line-clamp-1 max-w-[250px]">
                                {event.description}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] bg-muted/50 border-input-border">
                            {event.event_type_label || 'Other'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(event.date), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isUpcoming ? 'default' : 'secondary'}
                            className={cn(
                              "text-[10px] px-2 py-0.5 border-0",
                              isUpcoming
                                ? "bg-primary/15 text-primary hover:bg-primary/20"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                          >
                            {isUpcoming ? 'Upcoming' : 'Past'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg"
                              onClick={() => handleEditEvent(event)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                              onClick={() => setEventToDelete(event)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-border/50 bg-muted/20">
                <div className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <EventDialog
        open={isEventDialogOpen}
        onOpenChange={setIsEventDialogOpen}
        event={editingEvent}
        onSuccess={() => { }}
      />

      <AlertDialog open={!!eventToDelete} onOpenChange={(open) => !open && setEventToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {eventToDelete?.title ?? "this event"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => eventToDelete && handleDeleteEvent(eventToDelete._id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
