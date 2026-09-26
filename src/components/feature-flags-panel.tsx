"use client"

import { useState } from "react"
import { AlertTriangle, Clock, Loader2, RotateCcw } from "lucide-react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { useOrganization } from "@/hooks/use-organization"
import { useUserRole } from "@/hooks/use-user-role"
import { errorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"

/**
 * The flags console.
 *
 * Everything shown comes from the catalogue in `convex/lib/flags/catalog.ts`,
 * not from the rows in the table — which is what makes a flag that has never
 * been overridden still appear, with its declared default and its owner. A
 * screen that listed only overrides would hide every flag until somebody had
 * already changed one.
 *
 * Two scopes, rendered differently on purpose. A kill switch is deployment-wide
 * and super-admin only; an org admin sees its state (so an incident is
 * legible from inside their own console) but cannot touch it.
 */
export function FeatureFlagsPanel() {
  const { organization } = useOrganization()
  const { isAdmin } = useUserRole()
  const [pending, setPending] = useState<string | null>(null)
  /**
   * Which level a write lands on, for flags that can take either.
   *
   * A super admin is usually doing one of two jobs — rolling a feature out to
   * everyone, or switching it on for one church ahead of the rest — and they
   * are different jobs, not a per-row decision. Kill switches ignore this
   * entirely: they are always deployment-wide.
   */
  const [editScope, setEditScope] = useState<"org" | "global" | null>(null)
  const { toast } = useToast()

  const catalogue = useQuery(
    api.flags.catalogue,
    !isAdmin ? "skip" : organization?._id ? { organization_id: organization._id } : {},
  )
  const setFlag = useMutation(api.flags.set)
  const clearOverride = useMutation(api.flags.clearOverride)

  const run = async (key: string, work: () => Promise<unknown>) => {
    setPending(key)
    try {
      await work()
    } catch (err) {
      toast({
        title: "Couldn't change that flag",
        description: errorMessage(err),
        variant: "destructive",
      })
    } finally {
      setPending(null)
    }
  }

  if (!isAdmin) {
  /**
   * The `/admin` route is gated on being signed in, not on being an admin, so
   * a plain member can reach the console shell. The backend refuses these
   * queries either way — this stops the refusal arriving as a thrown query
   * that takes the page down with it.
   */
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Feature flags are managed by administrators.
      </p>
    )
  }

  if (catalogue === undefined) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    )
  }

  const canSetGlobal = catalogue.some((f) => f.canSetGlobal)
  const scopeChoice: "org" | "global" = editScope ?? (canSetGlobal ? "global" : "org")

  const kills = catalogue.filter((f) => f.killSwitch)
  const rest = catalogue.filter((f) => !f.killSwitch)

  const overdue = catalogue.filter(
    (f) => f.expiresAt !== null && new Date(f.expiresAt) < new Date(),
  )

  const row = (flag: (typeof catalogue)[number]) => {
    // A kill switch, or a flag the catalogue won't let an org override, is
    // always written deployment-wide whatever the selector says.
    const scope: "org" | "global" =
      flag.killSwitch || !flag.canSetForOrg ? "global" : scopeChoice
    const editable = scope === "global" ? flag.canSetGlobal : flag.canSetForOrg
    const overridden = scope === "org" ? flag.orgValue !== null : flag.globalValue !== null
    /**
     * The switch shows the value AT THE LEVEL BEING EDITED, not the resolved
     * one. Editing the deployment-wide value of a flag this org has overridden
     * would otherwise leave the toggle unmoved after a successful write, which
     * reads as a failure.
     */
    const shownValue =
      scope === "global" ? (flag.globalValue ?? flag.defaultValue) : flag.value
    const maskedByOrg = scope === "global" && flag.orgValue !== null && flag.orgValue !== shownValue
    const busy = pending === flag.key

    return (
      <div
        key={flag.key}
        className="flex flex-col gap-2 border-b border-border/50 p-4 last:border-0 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-sm font-medium">{flag.key}</code>
            {flag.killSwitch && (
              <Badge variant="destructive" className="text-[10px]">
                Kill switch
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] capitalize">
              {flag.kind}
            </Badge>
            {overridden ? (
              <Badge variant="secondary" className="text-[10px]">
                {flag.source === "org" ? "Set for this org" : "Set deployment-wide"}
              </Badge>
            ) : (
              <span className="text-[10px] text-muted-foreground">
                Default ({flag.defaultValue ? "on" : "off"})
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{flag.description}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Owner: {flag.owner}</span>
            {maskedByOrg && (
              <span className="text-warning-strong dark:text-warning-strong">
                This org overrides it to {flag.orgValue ? "on" : "off"}
              </span>
            )}
            {flag.expiresAt && (
              <span
                className={cn(
                  "flex items-center gap-1",
                  new Date(flag.expiresAt) < new Date() && "text-destructive",
                )}
              >
                <Clock className="h-3 w-3" />
                Remove by {flag.expiresAt}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {overridden && editable && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                run(flag.key, () =>
                  clearOverride({
                    key: flag.key,
                    scope,
                    ...(organization?._id ? { organization_id: organization._id } : {}),
                  }),
                )
              }
              title="Clear the override and fall back to the declared default"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              checked={shownValue}
              disabled={!editable}
              onCheckedChange={(next) =>
                run(flag.key, () =>
                  setFlag({
                    key: flag.key,
                    enabled: next,
                    scope,
                    ...(organization?._id ? { organization_id: organization._id } : {}),
                  }),
                )
              }
              aria-label={flag.key}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {overdue.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">
              {overdue.length} flag{overdue.length === 1 ? " is" : "s are"} past the removal date
            </p>
            <p className="text-muted-foreground">
              The fix is to delete the flag and its branches, not to push the date out. The
              catalogue test fails while they're still declared.
            </p>
          </div>
        </div>
      )}

      {canSetGlobal && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/50 bg-muted/20 p-3">
          <span className="text-sm text-muted-foreground">Changes apply to</span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={scopeChoice === "global" ? "default" : "outline"}
              onClick={() => setEditScope("global")}
            >
              Every organization
            </Button>
            <Button
              size="sm"
              variant={scopeChoice === "org" ? "default" : "outline"}
              disabled={!organization?._id}
              onClick={() => setEditScope("org")}
            >
              Only {organization?.name ?? "this organization"}
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            Kill switches are always deployment-wide.
          </span>
        </div>
      )}

      <Card className="rounded-xl border-border/50 shadow-soft overflow-hidden">
        <CardHeader className="bg-muted/20 border-b border-border/50 py-4">
          <CardTitle className="text-base">Kill switches</CardTitle>
          <CardDescription>
            Deployment-wide incident controls. On is the normal state; turning one off is the
            incident action, and it applies to every organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">{kills.map(row)}</CardContent>
      </Card>

      <Card className="rounded-xl border-border/50 shadow-soft overflow-hidden">
        <CardHeader className="bg-muted/20 border-b border-border/50 py-4">
          <CardTitle className="text-base">Features</CardTitle>
          <CardDescription>
            Release and operational flags. Anything marked "Set for this org" applies only to{" "}
            {organization?.name ?? "this organization"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">{rest.map(row)}</CardContent>
      </Card>
    </div>
  )
}
