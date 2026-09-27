"use client"

import { useEffect, useState } from "react"
import { useMutation } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { FlaskConical, Info } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"

interface SimulateResult {
  supported: boolean
  note?: string
  matched_count: number
  scanned: number
  capped?: boolean
  samples: Array<{
    member_id: string
    member_name: string
    actions: Array<{ action_key: string; channel?: string; text: string; missing: string[] }>
  }>
}

const ACTION_LABEL: Record<string, string> = {
  in_app: "In-app",
  sms: "SMS",
  send_in_app: "In-app",
  send_sms: "SMS",
  notify_leaders: "Leaders notified",
  create_follow_up_task: "Care task",
}

function actionLabel(key: string): string {
  if (ACTION_LABEL[key]) return ACTION_LABEL[key]
  const plain = key.replace(/_/g, " ")
  return plain.charAt(0).toUpperCase() + plain.slice(1)
}

interface SimulateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule: any | null
}

export function SimulateDialog({ open, onOpenChange, rule }: SimulateDialogProps) {
  const simulate = useMutation(api.automation.rules.simulateRule)
  const [result, setResult] = useState<SimulateResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !rule) return
    let cancelled = false
    setLoading(true)
    setResult(null)
    setError(null)
    simulate({ id: rule._id })
      .then((r) => { if (!cancelled) setResult(r as SimulateResult) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "The simulation didn't finish") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule?._id])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            Simulate: {rule?.name}
          </DialogTitle>
          <DialogDescription>Who this would reach right now, and what each person would get. Archived members and anyone outside the units it is limited to are left out. Nothing is sent.</DialogDescription>
        </DialogHeader>

        {loading && <LoadingState message="Running the simulation…" />}
        {error && <EmptyState icon={Info} title="Couldn't simulate" description={error} />}

        {!loading && !error && result && (
          <>
            {!result.supported ? (
              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-4">
                <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">{result.note}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4 text-sm">
                  <Badge variant="outline" className="border-transparent bg-primary/15 text-primary">
                    {result.matched_count} member{result.matched_count === 1 ? "" : "s"} would match
                  </Badge>
                  <span className="text-muted-foreground">{result.scanned} checked{result.capped ? " (stopped at the limit)" : ""}</span>
                </div>

                {result.samples.length === 0 ? (
                  <EmptyState icon={FlaskConical} title="No members match yet" description="Nobody currently meets this automation's conditions." />
                ) : (
                  <ScrollArea className="max-h-[45vh] pr-3">
                    <div className="space-y-3">
                      {result.samples.map((s) => (
                        <div key={s.member_id} className="rounded-lg border border-border/60 p-3">
                          <p className="text-sm font-medium mb-2">{s.member_name}</p>
                          <div className="space-y-2">
                            {s.actions.map((a, i) => (
                              <div key={i} className="text-sm">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <Badge variant="secondary">{actionLabel(a.channel || a.action_key)}</Badge>
                                  {a.missing.length > 0 && (
                                    <span className="text-xs text-warning-strong">Missing: {a.missing.join(", ")}</span>
                                  )}
                                </div>
                                <p className="text-muted-foreground">{a.text}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
