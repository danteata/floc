"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useOrganization } from "@/hooks/use-organization"
import {
  AutomationTemplate,
  DEFAULT_FORM_VALUES,
  RuleFormValues,
  TEMPLATE_VARIABLES,
  buildRulePayload,
  previewMessage,
  ruleToFormValues,
} from "./templates"

interface RuleEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: AutomationTemplate
  existingRule?: any | null
}

export function RuleEditorDialog({ open, onOpenChange, template, existingRule }: RuleEditorDialogProps) {
  const { organization } = useOrganization()
  const createRule = useMutation(api.automation.rules.createRule)
  const updateRule = useMutation(api.automation.rules.updateRule)

  const eventTypes = useQuery(api.event_types.getAll, open ? {} : "skip") || []
  const units = useQuery(api.units.list, open ? {} : "skip") || []

  const [values, setValues] = useState<RuleFormValues>(DEFAULT_FORM_VALUES)
  const [unitIds, setUnitIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const activeTemplate: AutomationTemplate | undefined = existingRule
    ? ruleToFormValues(existingRule).template
    : template

  // Seed form when the dialog opens.
  useEffect(() => {
    if (!open) return
    if (existingRule) {
      const { values: v, unitIds: u } = ruleToFormValues(existingRule)
      setValues(v)
      setUnitIds(u)
    } else if (template) {
      setValues({ ...DEFAULT_FORM_VALUES, ...template.defaults } as RuleFormValues)
      setUnitIds([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingRule?._id, template?.id])

  if (!activeTemplate) return null
  const fields = activeTemplate.fields
  const set = <K extends keyof RuleFormValues>(key: K, val: RuleFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: val }))

  const insertVar = (token: string) => set("message", `${values.message}${values.message && !values.message.endsWith(" ") ? " " : ""}${token}`)

  const validate = (): string | null => {
    if (!values.name.trim()) return "Give the automation a name."
    if (fields.includes("message") && !values.message.trim()) return "Message can't be empty."
    if (activeTemplate.triggerKey === "member.consecutive_absences" && values.threshold < 1)
      return "Threshold must be at least 1."
    if (activeTemplate.triggerKey === "member.no_attendance_for_days" && values.days < 1)
      return "Days must be at least 1."
    if (
      activeTemplate.triggerKey === "member.engagement_score_below" &&
      (values.threshold < 1 || values.threshold > 100)
    )
      return "Threshold must be between 1 and 100."
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }
    setSaving(true)
    try {
      const payload = buildRulePayload(activeTemplate, values, unitIds)
      if (existingRule) {
        await updateRule({
          id: existingRule._id,
          name: payload.name,
          description: payload.description,
          trigger_params: payload.trigger_params,
          conditions: payload.conditions,
          actions: payload.actions,
          unit_ids: payload.unit_ids as any,
          cooldown_days: payload.cooldown_days,
          dedup_bucket: payload.dedup_bucket,
        })
        toast.success("Automation updated")
      } else {
        await createRule({
          organization_id: organization?._id,
          name: payload.name,
          description: payload.description,
          trigger_key: payload.trigger_key,
          trigger_params: payload.trigger_params,
          conditions: payload.conditions,
          actions: payload.actions,
          unit_ids: payload.unit_ids as any,
          cooldown_days: payload.cooldown_days,
          dedup_bucket: payload.dedup_bucket,
        })
        toast.success("Automation saved as a draft", {
          description: "It stays in dry run until you switch it to live. Simulate it first to see who it would reach.",
        })
      }
      onOpenChange(false)
    } catch (e) {
      toast.error("Couldn't save the automation", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <activeTemplate.icon className="h-4 w-4 text-muted-foreground" />
            {existingRule ? "Edit automation" : activeTemplate.title}
          </DialogTitle>
          <DialogDescription>{activeTemplate.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="For example, 3-week absence follow-up" />
          </div>

          {fields.includes("event_type_value") && (
            <div className="space-y-2">
              <Label>Which service?</Label>
              <Select value={values.event_type_value || "__all__"} onValueChange={(v) => set("event_type_value", v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All services" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All services</SelectItem>
                  {eventTypes.map((et: any) => (
                    <SelectItem key={et.value} value={et.value}>
                      {et.label === et.label?.toLowerCase() ? et.label.replace(/\b[a-z]/g, (c: string) => c.toUpperCase()) : et.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {fields.includes("threshold") && (
            <div className="space-y-2">
              <Label>
                {activeTemplate.triggerKey === "member.engagement_score_below"
                  ? "Below what engagement score (0 to 100)?"
                  : "After how many consecutive absences?"}
              </Label>
              <Input
                type="number"
                min={1}
                max={activeTemplate.triggerKey === "member.engagement_score_below" ? 100 : undefined}
                value={values.threshold}
                onChange={(e) => set("threshold", Number(e.target.value))}
              />
            </div>
          )}

          {fields.includes("days") && (
            <div className="space-y-2">
              <Label>After how many days without attending?</Label>
              <Input type="number" min={1} value={values.days} onChange={(e) => set("days", Number(e.target.value))} />
            </div>
          )}

          {fields.includes("days_before") && (
            <div className="space-y-2">
              <Label>How many days before their birthday? (0 sends on the day)</Label>
              <Input type="number" min={0} value={values.days_before} onChange={(e) => set("days_before", Number(e.target.value))} />
            </div>
          )}

          {fields.includes("channel") && (
            <div className="space-y-2">
              <Label>Send via</Label>
              <Select value={values.channel} onValueChange={(v) => set("channel", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_app">In-app notification</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
              {values.channel === "sms" && (
                <p className="text-xs text-muted-foreground">
                  Texts go only to members with a valid phone number who agreed to receive them, never during quiet hours, and within your sending limits.
                </p>
              )}
            </div>
          )}

          {fields.includes("message") && (
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea rows={3} value={values.message} onChange={(e) => set("message", e.target.value)} className="resize-none" />
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARIABLES.map((v) => (
                  <Badge
                    key={v.token}
                    variant="secondary"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
                    onClick={() => insertVar(v.token)}
                  >
                    {v.label}
                  </Badge>
                ))}
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground mb-1">Preview</p>
                <p className="text-sm">{previewMessage(values.message, organization?.name) || "…"}</p>
              </div>
            </div>
          )}

          {fields.includes("notify_leaders") && (
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <Label className="cursor-pointer">Also alert unit leaders</Label>
                <p className="text-xs text-muted-foreground">Send the member's unit leaders an in-app notification.</p>
              </div>
              <Switch checked={values.notify_leaders} onCheckedChange={(c) => set("notify_leaders", c)} />
            </div>
          )}

          {fields.includes("assign_task") && (
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <Label className="cursor-pointer">Create a care task</Label>
                <p className="text-xs text-muted-foreground">
                  Give the member's unit leader a care task they can mark as contacted, then resolved.
                </p>
              </div>
              <Switch checked={values.assign_task} onCheckedChange={(c) => set("assign_task", c)} />
            </div>
          )}

          {fields.includes("active_only") && (
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <Label className="cursor-pointer">Active members only</Label>
                <p className="text-xs text-muted-foreground">Skip inactive members and visitors.</p>
              </div>
              <Switch checked={values.active_only} onCheckedChange={(c) => set("active_only", c)} />
            </div>
          )}

          {fields.includes("cooldown_days") && (
            <div className="space-y-2">
              <Label>Days before it can run again</Label>
              <Input type="number" min={0} value={values.cooldown_days} onChange={(e) => set("cooldown_days", Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">It won't run again for the same member within this many days. Use 0 to let it repeat any time.</p>
            </div>
          )}

          {/* Unit scope (optional) */}
          <div className="space-y-2">
            <Label>Limit to units (optional)</Label>
            <div className="flex flex-wrap gap-1.5">
              {unitIds.map((id) => {
                const unit = units.find((u: any) => u._id === id)
                return unit ? (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => setUnitIds((prev) => prev.filter((x) => x !== id))}
                  >
                    {unit.name} <span className="ml-1">&times;</span>
                  </Badge>
                ) : null
              })}
            </div>
            <Select onValueChange={(v) => { if (v && !unitIds.includes(v)) setUnitIds((prev) => [...prev, v]) }}>
              <SelectTrigger><SelectValue placeholder="All members (add units to narrow)" /></SelectTrigger>
              <SelectContent>
                {units.filter((u: any) => !unitIds.includes(u._id)).map((u: any) => (
                  <SelectItem key={u._id} value={u._id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : existingRule ? "Save changes" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
