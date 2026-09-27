"use client"

import { useMutation, useQuery } from "convex/react"
import { Bell, BellOff, CheckCheck } from "lucide-react"
import { Link } from "react-router-dom"
import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Id } from "../../convex/_generated/dataModel"
import { formatDayShort, formatDayTime } from '@/lib/display'

export function NotificationsPopover() {
  const notifications = useQuery(api.notifications.listMine, { limit: 15 })
  const unreadCount = useQuery(api.notifications.unreadCount, {}) ?? 0
  const markRead = useMutation(api.notifications.markRead)
  const markAllRead = useMutation(api.notifications.markAllRead)

  const hasUnread = unreadCount > 0

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 hover:bg-muted rounded-lg"
          aria-label={
            hasUnread
              ? `${unreadCount} unread notifications`
              : "Notifications"
          }
        >
          <Bell className="h-4 w-4 text-muted-foreground" />
          {hasUnread && (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs text-muted-foreground"
              onClick={() => markAllRead()}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all as read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications === undefined && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          )}
          {notifications?.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
              <BellOff className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-sm font-medium">No notifications yet.</p>
              <p className="text-xs text-muted-foreground">
                We&apos;ll let you know here when something needs your attention.
              </p>
            </div>
          )}
          {notifications?.map((n) => {
            const content = (
              <div
                className={cn(
                  "border-b px-4 py-3 last:border-0 transition-colors hover:bg-muted/50",
                  !n.read_at && "bg-primary/5",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug">{n.title}</p>
                  {!n.read_at && (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                  )}
                </div>
                {n.body && (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {n.body}
                  </p>
                )}
                <p
                  className="mt-1 text-xs text-muted-foreground"
                  title={formatDayTime(new Date(n.created_at))}
                >
                  {timeAgo(n.created_at)}
                </p>
              </div>
            )

            const onOpen = () => {
              if (!n.read_at) {
                void markRead({ id: n._id as Id<"notifications"> })
              }
            }

            if (n.href) {
              return (
                <Link key={n._id} to={n.href} onClick={onOpen}>
                  {content}
                </Link>
              )
            }

            return (
              <button
                key={n._id}
                type="button"
                className="block w-full text-left"
                onClick={onOpen}
              >
                {content}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** "Just now", "5 min ago", "3 hours ago", "Yesterday", "4 days ago", then "26 Sep". */
function timeAgo(value: number | string): string {
  const then = new Date(value)
  const seconds = Math.round((Date.now() - then.getTime()) / 1000)
  if (!Number.isFinite(seconds)) return ""
  if (seconds < 60) return "Just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  return formatDayShort(then)
}
