"use client"

import { useState } from "react"
import { Check, Loader2, Palette, RotateCcw } from "lucide-react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { deriveBrand, isBrandHex } from "../../convex/lib/theme/brand"
import { BRAND_PRESETS, DEFAULT_BRAND_HEX } from "../../convex/lib/theme/presets"
import { brandVariables } from "../../convex/lib/theme/css"
import { sequentialRamp } from "../../convex/lib/theme/chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTheme } from "@/components/theme-provider"
import { useToast } from "@/hooks/use-toast"
import { useOrganization } from "@/hooks/use-organization"
import { errorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"

/**
 * Choosing an organization's colour.
 *
 * The preview is rendered with the SAME function the runtime provider uses
 * (`brandVariables`), scoped to this card's own element rather than the
 * document — so an admin auditioning a colour sees exactly what they will get,
 * without repainting the app around them while they decide.
 */
export function BrandingPanel() {
  const { organization } = useOrganization()
  const { resolvedTheme } = useTheme()
  const { toast } = useToast()

  const theme = useQuery(
    api.organizations.getTheme,
    organization?._id ? { organization_id: organization._id } : "skip",
  )
  const setTheme = useMutation(api.organizations.setTheme)
  const clearTheme = useMutation(api.organizations.clearTheme)

  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const saved = theme?.configured ? theme.brandHex : DEFAULT_BRAND_HEX
  const current = draft ?? saved
  const valid = isBrandHex(current)
  const dirty = draft !== null && draft.toLowerCase() !== saved.toLowerCase()

  // Derived for the preview and for the adjustment list. Wrapped because a
  // half-typed hex reaches here on every keystroke.
  let preview: Record<string, string> = {}
  let adjustments: ReturnType<typeof deriveBrand>["adjustments"] = []
  let ramp: string[] = []
  if (valid) {
    try {
      preview = brandVariables(current, resolvedTheme)
      adjustments = deriveBrand(current).adjustments.filter((a) => a.mode === resolvedTheme)
      ramp = sequentialRamp(current, resolvedTheme)
    } catch {
      preview = {}
    }
  }

  const save = async (hex: string, presetId?: string) => {
    if (!organization?._id) return
    setSaving(true)
    try {
      const result = await setTheme({
        organization_id: organization._id,
        ...(presetId ? { presetId } : { brandHex: hex }),
      })
      setDraft(null)
      toast({
        title: "Brand colour saved",
        description:
          result.adjusted > 0
            ? `Applied. ${result.adjusted} shade${result.adjusted === 1 ? " was" : "s were"} adjusted to stay readable.`
            : "Applied across the app.",
      })
    } catch (err) {
      toast({
        title: "Couldn't save that colour",
        description: errorMessage(err),
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    if (!organization?._id) return
    setSaving(true)
    try {
      await clearTheme({ organization_id: organization._id })
      setDraft(null)
      toast({ title: "Back to the default colours" })
    } catch (err) {
      toast({ title: "Couldn't reset", description: errorMessage(err), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          Brand colour
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          One colour. Buttons, links, highlights and charts are derived from it, and every shade is
          checked for readability in both light and dark mode before it's used.
        </p>
      </div>

      <div className="space-y-3">
        <Label>Presets</Label>
        <div className="flex flex-wrap gap-2">
          {BRAND_PRESETS.map((preset) => {
            const active = current.toLowerCase() === preset.hex.toLowerCase()
            return (
              <button
                key={preset.id}
                type="button"
                title={`${preset.name} · ${preset.hex}`}
                onClick={() => setDraft(preset.hex)}
                className={cn(
                  "h-9 w-9 rounded-lg border-2 transition-all hover:scale-105",
                  active ? "border-foreground" : "border-border/50",
                )}
                style={{ backgroundColor: preset.hex }}
              >
                {active && <Check className="h-4 w-4 mx-auto text-white drop-shadow" />}
                <span className="sr-only">{preset.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="brand-hex">Or paste your hex</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Pick a colour"
            value={valid ? current : DEFAULT_BRAND_HEX}
            onChange={(e) => setDraft(e.target.value)}
            className="h-10 w-12 rounded-lg border border-border/50 bg-transparent p-1"
          />
          <Input
            id="brand-hex"
            value={current}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="#0369a1"
            className={cn("max-w-[180px] font-mono", !valid && "border-destructive")}
          />
          {!valid && (
            <span className="text-xs text-destructive">
              Hex only, like #0369a1 (not a colour name or rgb()).
            </span>
          )}
        </div>
      </div>

      {/* The preview. Scoped to this element, painted by the runtime's own
          function, so what an admin auditions is what the app will render. */}
      <div
        style={preview as React.CSSProperties}
        className="rounded-xl border border-border/50 bg-background p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={!valid}>
            Primary action
          </Button>
          <Button size="sm" variant="outline" disabled={!valid}>
            Secondary
          </Button>
          <Badge className="bg-accent text-accent-foreground hover:bg-accent">Selected</Badge>
          <a href="#preview" onClick={(e) => e.preventDefault()} className="text-sm text-accent-foreground underline">
            A link in your colour
          </a>
        </div>
        <div className="flex items-end gap-1 h-12">
          {ramp.map((hex, i) => (
            <div
              key={hex + i}
              className="flex-1 rounded-sm"
              style={{ backgroundColor: hex, height: `${40 + i * 15}%` }}
              title={hex}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Chart colours, {resolvedTheme} mode. Toggle the theme to preview the other.
        </p>
      </div>

      {adjustments.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 space-y-1">
          <p className="text-sm font-medium">Adjusted to stay readable</p>
          {adjustments.map((a, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              <span className="font-mono">{a.token}</span>: {a.from} → {a.to} (contrast{" "}
              {a.fromRatio}:1 → {a.toRatio}:1)
            </p>
          ))}
          <p className="text-xs text-muted-foreground pt-1">
            Your colour is kept where it's legible and darkened or lightened where it isn't. The
            hue stays yours either way.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => save(current)} disabled={!valid || !dirty || saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save brand colour
        </Button>
        {draft !== null && (
          <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
            Cancel
          </Button>
        )}
        {theme?.configured && (
          <Button variant="outline" onClick={reset} disabled={saving} className="gap-2">
            <RotateCcw className="h-3.5 w-3.5" />
            Use the default
          </Button>
        )}
      </div>
    </div>
  )
}
