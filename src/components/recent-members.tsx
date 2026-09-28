"use client"

import { UserPlus } from "lucide-react"
import { MemberAvatar } from "@/components/ui/member-avatar"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { formatDayShort } from '@/lib/display'
import type { Id } from "../../convex/_generated/dataModel"

/** "26 Sep": the day a member was added, as people read it. */
function addedOn(timestamp: number): string {
  return formatDayShort(new Date(timestamp))
}

export function RecentMembers({ unitId }: { unitId?: Id<"units"> } = {}) {
  const members = useQuery(api.members.getRecent, { limit: 5, ...(unitId ? { unit_id: unitId } : {}) });

  if (members === undefined) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (members.length === 0) {
    return (
      <EmptyState
        icon={UserPlus}
        title="No members yet"
        description="Members you add will show up here."
        className="py-8"
      />
    )
  }

  return (
    <div className="space-y-1">
      {members.map((member) => (
        <div key={member.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
          <MemberAvatar name={member.name} src={member.avatar_url} />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-sm font-medium leading-none">{member.name}</p>
            <p className="truncate text-sm text-muted-foreground">{member.email || "No email"}</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {addedOn(member._creationTime)}
          </span>
        </div>
      ))}
    </div>
  )
}
