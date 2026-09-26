"use client"

import { format } from "date-fns"
import { MemberAvatar } from "@/components/ui/member-avatar"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { cn } from "@/lib/utils"

export function RecentMembers() {
  const members = useQuery(api.members.getRecent, { limit: 5 });

  if (members === undefined) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center animate-pulse px-3 py-2">
            <div className="h-9 w-9 rounded-full bg-muted"></div>
            <div className="ml-4 space-y-1">
              <div className="h-4 w-[200px] rounded bg-muted"></div>
              <div className="h-3 w-[150px] rounded bg-muted"></div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (members.length === 0) {
    return <div className="text-sm text-muted-foreground text-center py-8">No recent members found.</div>
  }

  return (
    <div className="space-y-2">
      {members.map((member) => (
        <div key={member.id} className="flex items-center transition-all duration-200 hover:bg-accent/50 p-3 rounded-lg group">
          <MemberAvatar name={member.name} src={member.avatar_url} className="ring-2 ring-transparent group-hover:ring-primary/20 transition-all" />
          <div className="ml-4 space-y-1">
            <p className="text-sm font-semibold leading-none">{member.name}</p>
            <p className="text-sm text-muted-foreground">{member.email || 'No email'}</p>
          </div>
          <div className="ml-auto text-xs bg-secondary text-secondary-foreground px-2.5 py-1 rounded-md">
            {format(new Date(member._creationTime), "MMM d")}
          </div>
        </div>
      ))}
    </div>
  )
}
