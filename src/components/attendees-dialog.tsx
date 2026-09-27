'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Id } from '../../convex/_generated/dataModel'
import { MemberAvatar } from '@/components/ui/member-avatar'
import { titleCase, formatDay } from '@/lib/display'

interface AttendeesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: any | null
  /** The page's unit filter, so the list matches the headcount it was opened from. */
  unitId?: Id<"units">
}

export function AttendeesDialog({
  open,
  onOpenChange,
  record,
  unitId,
}: AttendeesDialogProps) {
  const attendanceId = record?.attendance_id || record?._id || record?.id;

  const rawAttendees = useQuery(
    api.attendance.getAttendeesWithDetails,
    open && attendanceId
      ? { attendanceId: attendanceId as Id<"attendance">, ...(unitId ? { unit_id: unitId } : {}) }
      : "skip"
  );

  const loading = open && rawAttendees === undefined;

  // No frontend filtering for source-specific views needed anymore
  const attendees = (rawAttendees || []).filter((a): a is NonNullable<typeof a> => !!a);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Who was there{loading ? "" : ` (${attendees.length})`}</DialogTitle>
          <DialogDescription>
            {record && (
              <>
                {titleCase(record.event_type_label || record.event_type_value) || 'Attendance'}
                {' · '}
                {formatDay(record.date)}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="text-center py-4 text-sm text-muted-foreground">Loading…</div>
        ) : attendees.length === 0 ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No one was marked present.
          </div>
        ) : (
          <div className="max-h-64 overflow-auto">
            <ul className="space-y-2">
              {attendees.map((a, idx) => (
                <li key={a.member_id} className="border-b border-border pb-2 flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-6 text-right tabular-nums select-none">
                    {idx + 1}.
                  </span>
                  <MemberAvatar name={a.name || ''} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {a.name || 'Unnamed member'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.email}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
