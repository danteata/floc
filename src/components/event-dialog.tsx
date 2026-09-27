'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { format, parse } from 'date-fns'
import { Calendar as CalendarIcon, Clock, MapPin, Type, FileText, Sparkles, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useToast } from '@/hooks/use-toast'
import { useTerminology } from '@/hooks/use-terminology'
import { useEventTypes } from '@/hooks/use-event-types'
import { useUserRole } from '@/hooks/use-user-role'
import { cn } from '@/lib/utils'
import { useMutation, useQuery } from 'convex/react'
import { useAnalytics } from '@/hooks/useAnalytics'
import { AnalyticsEventType } from '@/services/analytics/types'
import { api } from '../../convex/_generated/api'
import { Id } from '../../convex/_generated/dataModel'

const eventSchema = z.object({
  title: z.string().min(1, "Give the event a title"),
  description: z.string().optional(),
  date: z.date({
    required_error: "Choose a date",
  }),
  time: z.string().optional(),
  location: z.string().optional(),
  type: z.string().min(1, "Choose a type"),
})

type EventFormData = z.infer<typeof eventSchema>

interface EventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event?: any | null
  onSuccess?: () => void
}

export function EventDialog({ open, onOpenChange, event, onSuccess }: EventDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()
  const { terminology } = useTerminology()
  const { eventTypes: allEventTypes, isLoading: eventTypesLoading } = useEventTypes()
  const { isAdmin, role, unitLeaderships } = useUserRole()
  // The server lets a unit-level admin write only events whose type is scoped
  // to a unit they lead (events.ts requireEventTypeWriteAccess), so offer
  // only those types. Org admins see them all.
  const ledUnitIds = new Set(unitLeaderships.map((u) => String(u._id)))
  const isUnitRole = ['unit_admin', 'division_admin', 'sub_unit_admin'].includes(role)
  const eventTypes = isAdmin
    ? allEventTypes
    : allEventTypes.filter((t) =>
        isUnitRole && (t.unit_ids ?? []).some((id) => ledUnitIds.has(String(id))))
  const { trackEvent } = useAnalytics()

  const currentOrg = useQuery(api.organizations.current)
  const createMutation = useMutation(api.events.create)
  const updateMutation = useMutation(api.events.update)

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "",
      description: "",
      time: "",
      location: "",
      type: "",
    },
  })

  useEffect(() => {
    if (open) {
      if (event) {
        form.reset({
          title: event.title,
          description: event.description || "",
          date: parse(event.date, 'yyyy-MM-dd', new Date()),
          time: event.time || "",
          location: event.location || "",
          type: event.event_type_value || "",
        })
      } else {
        form.reset({
          title: "",
          description: "",
          date: new Date(),
          time: "",
          location: "",
          type: "",
        })
      }
    }
  }, [open, event, form])

  const onSubmit = async (data: EventFormData) => {
    if (!currentOrg) return;
    setIsLoading(true)
    try {
      const selectedType = eventTypes.find(t => t.value === data.type);
      if (!selectedType && data.type !== 'other') {
        throw new Error("Invalid event type");
      }

      const eventData = {
        title: data.title,
        description: data.description || "",
        date: format(data.date, 'yyyy-MM-dd'),
        time: data.time?.trim() || undefined,
        location: data.location?.trim() || undefined,
        event_type_id: selectedType?._id as Id<"event_types">,
        organization_id: currentOrg._id as Id<"organizations">,
        active: true,
      }

      if (event) {
        await updateMutation({
          id: event._id as Id<"events">,
          updates: {
            title: eventData.title,
            date: eventData.date,
            description: eventData.description,
            event_type_id: eventData.event_type_id,
            // Send an empty string (not undefined) so clearing a field is saved.
            time: data.time?.trim() ?? "",
            location: data.location?.trim() ?? "",
          }
        })
        toast({ title: "Event updated" })
        trackEvent(AnalyticsEventType.EVENT_UPDATED, {
          event_id: event._id,
          event_type: data.type,
        })
      } else {
        await createMutation(eventData)
        toast({ title: "Event created" })
        trackEvent(AnalyticsEventType.EVENT_CREATED, {
          event_type: data.type,
          has_description: !!data.description,
        })
      }

      onOpenChange(false)
      onSuccess?.()
    } catch (error: any) {
      toast({ title: "Couldn't save the event", description: error.message, variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] border border-border/50 shadow-soft-xl rounded-xl p-0 overflow-hidden bg-background">
        <DialogHeader className="p-6 bg-muted/30 border-b border-border/50">
          <DialogTitle className="text-lg font-semibold text-foreground">
            {event ? "Edit event" : "New event"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {event ? "Change the event's details." : "Add a service or event to the calendar."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm flex items-center gap-2">
                    <Type className="h-4 w-4 text-muted-foreground" /> Title <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="For example, Sunday service" {...field} className="h-11 rounded-lg" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" /> Description
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What it is and who it's for…"
                      className="resize-none h-24 rounded-lg"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-sm flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground" /> Date <span className="text-destructive">*</span>
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal h-11 rounded-lg",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "d MMM yyyy")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 rounded-lg shadow-soft-lg" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    initialFocus
                    className="rounded-md border shadow-sm"
                  />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-muted-foreground" /> Type <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-11 rounded-lg">
                          <SelectValue placeholder="Choose a type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-lg shadow-soft-lg">
                        {eventTypesLoading ? (
                          <SelectItem value="loading" disabled>Loading…</SelectItem>
                        ) : (
                          eventTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label === type.label.toLowerCase() ? type.label.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : type.label}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" /> Time
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="10:00 AM" {...field} className="h-11 rounded-lg" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" /> Location
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Main Sanctuary" {...field} className="h-11 rounded-lg" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-4 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-lg px-6"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || eventTypesLoading} className="h-11 rounded-lg px-8 shadow-soft hover:shadow-soft-lg transition-all">
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isLoading ? "Saving…" : event ? "Save changes" : "Create event"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
