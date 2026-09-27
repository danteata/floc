import * as React from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: React.ReactNode
  /** One line on what the page is for. */
  description?: React.ReactNode
  /** Buttons for the page's main actions, right-aligned on wide screens. */
  actions?: React.ReactNode
  /** Tabs or filters that belong to the header, set beneath it. */
  children?: React.ReactNode
  className?: string
}

/**
 * The one way a page opens: a Fraunces title, a single line of description, and
 * the page's actions. Pages used to build this by hand, each a little different,
 * some behind a coloured icon tile; the sidebar already shows the icon.
 */
export function PageHeader({ title, description, actions, children, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground md:text-[2.125rem]">
            {title}
          </h1>
          {description && (
            <p className="max-w-2xl text-sm text-muted-foreground md:text-[0.9375rem]">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
      </div>
      {children}
    </header>
  )
}
