import { Clock, MapPin, Calendar } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Event } from "@/types/database"
import { EmptyState } from "@/components/ui/empty-state"
import { formatDay, titleCase } from "@/lib/display"
import { useEventTypes, getEventTypeDisplayName } from "@/hooks/use-event-types"

interface UpcomingEventsProps {
  events: Event[]
  onEditEvent?: (event: Event) => void
  /** When given, only events it returns true for open the editor on click. */
  canEditEvent?: (event: Event) => boolean
}

export function UpcomingEvents({ events, onEditEvent, canEditEvent }: UpcomingEventsProps) {
  const { eventTypes } = useEventTypes()
  if (!events || events.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No upcoming events"
        description="Events you schedule will show up here."
        className="py-8"
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {events.slice(0, 6).map((event) => {
          const editable = !!onEditEvent && (!canEditEvent || canEditEvent(event))
          return (
          <div
            key={event.id ?? (event as { _id?: string })._id}
            className={`group relative min-w-0 rounded-lg border border-border bg-card p-4 transition-colors${editable ? " cursor-pointer hover:bg-muted/40" : ""}`}
            onClick={() => { if (editable) onEditEvent?.(event) }}
          >
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              {/* The type only when it adds something: auto-created events are named after their type. */}
              {titleCase((event as any).event_type_label || getEventTypeDisplayName(event.type || 'other', eventTypes)) !== titleCase(event.title) ? (
              <Badge variant={
                (event as any).event_type_color === 'default' ? 'default' :
                  (event as any).event_type_color === 'secondary' ? 'secondary' :
                    (event as any).event_type_color === 'destructive' ? 'destructive' :
                      'outline'
              } className="block min-w-0 max-w-[60%] truncate">
                {titleCase((event as any).event_type_label || getEventTypeDisplayName(event.type || 'other', eventTypes))}
              </Badge>
              ) : <span />}
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {formatDay(event.date)}
              </span>
            </div>

            <h3 className="font-semibold text-foreground line-clamp-1">{titleCase(event.title)}</h3>

            <div className="mt-3 space-y-2">
              {(event as any).time && (
                <div className="flex items-center text-xs text-muted-foreground">
                  <Clock className="mr-2 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{(event as any).time}</span>
                </div>
              )}
              {(event as any).location && (
                <div className="flex items-center text-xs text-muted-foreground">
                  <MapPin className="mr-2 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="line-clamp-1">{(event as any).location}</span>
                </div>
              )}
            </div>
            {event.description && (
              <p className="text-xs text-muted-foreground mt-3 line-clamp-2 leading-relaxed">
                {event.description}
              </p>
            )}
          </div>
          )
        })}
      </div>

    </div>
  )
}