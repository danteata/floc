import * as React from "react"
import { type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type Tone = "neutral" | "positive" | "negative" | "warning"

interface StatCardProps {
  label: React.ReactNode
  value: React.ReactNode
  icon?: LucideIcon
  /** A short line under the figure: a change, a comparison, a next step. */
  hint?: React.ReactNode
  hintTone?: Tone
  className?: string
  onClick?: () => void
}

const HINT_TONE: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  positive: "text-success-strong",
  negative: "text-destructive-strong",
  warning: "text-warning-strong",
}

/**
 * One figure, what it counts, and one line of context. The same card on every
 * screen: previously each page styled its own, with coloured tops, tinted icon
 * squares and hover effects that differed from page to page.
 */
export function StatCard({ label, value, icon: Icon, hint, hintTone = "neutral", className, onClick }: StatCardProps) {
  const Wrapper = onClick ? "button" : "div"
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 md:p-5",
        onClick && "transition-shadow hover:shadow-soft-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-muted-foreground">{label}</span>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />}
      </div>
      <div className="font-serif text-3xl font-medium leading-none tracking-tight text-foreground tabular-nums md:text-4xl">
        {value}
      </div>
      {hint && <p className={cn("text-xs leading-snug", HINT_TONE[hintTone])}>{hint}</p>}
    </Wrapper>
  )
}

/** The grid stat cards sit in: two across on a phone, up to four on a wide screen. */
export function StatGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4", className)}>{children}</div>
}
