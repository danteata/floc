import { Lock } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"

interface NoAccessProps {
  /** What this page lets people do, e.g. "manage labels". */
  what: string
  /** Who can, e.g. "administrators". */
  who?: string
}

/**
 * Shown when someone reaches a page their role does not open. Plain words and a
 * way back. Only render it once the role has loaded: while it is loading the
 * role reads as "member", which is how admins used to be told they had no access.
 */
export function NoAccess({ what, who = "administrators" }: NoAccessProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <Lock className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">You don't have access to this page</h2>
        <p className="text-sm text-muted-foreground">
          Only {who} can {what}. Ask your church's administrator if you need it.
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  )
}
