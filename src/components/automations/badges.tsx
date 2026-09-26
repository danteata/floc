import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Rule lifecycle status.
export function RuleStatusBadge({ status, dryRun }: { status: string; dryRun?: boolean }) {
  const map: Record<string, string> = {
    enabled: "bg-success/10 text-success-strong border-success/20",
    paused: "bg-warning/10 text-warning-strong border-warning/20",
    draft: "bg-muted text-muted-foreground border-border",
  }
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="outline" className={cn("px-2.5 py-0.5 rounded-full text-xs", map[status] || map.draft)}>
        {label}
      </Badge>
      {dryRun && (
        <Badge variant="outline" className="px-2 py-0.5 rounded-full text-xs bg-info/10 text-info-strong border-info/20">
          Dry run
        </Badge>
      )}
    </div>
  )
}

// message_log outcome.
export function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, string> = {
    sent: "bg-success/10 text-success-strong border-success/20",
    dry_run: "bg-info/10 text-info-strong border-info/20",
    deduped: "bg-muted text-muted-foreground border-border",
    suppressed_consent: "bg-warning/10 text-warning-strong border-warning/20",
    quiet_hours_deferred: "bg-warning/10 text-warning-strong border-warning/20",
    throttled: "bg-warning/10 text-warning-strong border-warning/20",
    skipped_no_provider: "bg-muted text-muted-foreground border-border",
    failed: "bg-destructive/10 text-destructive border-destructive/20",
  }
  const label = outcome.replace(/_/g, " ")
  return (
    <Badge variant="outline" className={cn("px-2 py-0.5 rounded-full text-xs capitalize", map[outcome] || map.deduped)}>
      {label}
    </Badge>
  )
}
