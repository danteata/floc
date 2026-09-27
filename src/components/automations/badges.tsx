import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Rule lifecycle status.
export function RuleStatusBadge({ status, dryRun }: { status: string; dryRun?: boolean }) {
  const map: Record<string, string> = {
    enabled: "border-transparent bg-success/15 text-success-strong",
    paused: "border-transparent bg-warning/15 text-warning-strong",
    draft: "border-transparent bg-muted text-muted-foreground",
  }
  const label = status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="outline" className={map[status] || map.draft}>
        {label}
      </Badge>
      {dryRun && (
        <Badge variant="outline" className="border-transparent bg-info/15 text-info-strong">
          Dry run
        </Badge>
      )}
    </div>
  )
}

// message_log outcome.
export function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, string> = {
    sent: "bg-success/15 text-success-strong",
    dry_run: "bg-info/15 text-info-strong",
    deduped: "bg-muted text-muted-foreground",
    suppressed_consent: "bg-warning/15 text-warning-strong",
    quiet_hours_deferred: "bg-warning/15 text-warning-strong",
    throttled: "bg-warning/15 text-warning-strong",
    skipped_no_provider: "bg-muted text-muted-foreground",
    skipped_no_account: "bg-muted text-muted-foreground",
    failed: "bg-destructive/15 text-destructive",
  }
  const labels: Record<string, string> = {
    sent: "Sent",
    dry_run: "Dry run",
    deduped: "Already sent",
    suppressed_consent: "No consent",
    quiet_hours_deferred: "Held for quiet hours",
    throttled: "Sending limit reached",
    skipped_no_provider: "No SMS provider",
    skipped_no_account: "No Floc account",
    failed: "Failed",
  }
  const plain = outcome.replace(/_/g, " ")
  const label = labels[outcome] ?? plain.charAt(0).toUpperCase() + plain.slice(1)
  return (
    <Badge variant="outline" className={cn("border-transparent", map[outcome] || map.deduped)}>
      {label}
    </Badge>
  )
}
