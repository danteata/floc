import { Church } from "lucide-react"
import { cn } from "@/lib/utils"

/** The Floc mark and wordmark, as on the landing page. */
export function FlocMark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Church className="h-4 w-4" aria-hidden="true" />
      </span>
      {!compact && <span className="font-serif text-lg font-semibold tracking-tight text-foreground">Floc</span>}
    </span>
  )
}
