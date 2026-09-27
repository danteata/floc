// =============================================================================
// Guided automation templates.
//
// Per the "guided templates first" decision: admins pick a preset and tune a
// small set of fields rather than composing a raw trigger/condition/action
// graph. Each preset knows which fields to render and how to compile the tuned
// values into the rule payload the backend (automation.rules.createRule) wants.
// =============================================================================

import {
  CalendarHeart,
  Clock,
  HeartHandshake,
  TrendingDown,
  UserPlus,
  UserX,
  type LucideIcon,
} from "lucide-react"

// The tunable fields a preset can request. The editor renders a control per key.
export type FieldKey =
  | "message"
  | "channel"
  | "threshold"
  | "event_type_value"
  | "days"
  | "days_before"
  | "notify_leaders"
  | "assign_task"
  | "active_only"
  | "cooldown_days"

export type Channel = "in_app" | "sms"

// Values collected by the editor form (superset; presets use a subset).
export interface RuleFormValues {
  name: string
  message: string
  channel: Channel
  threshold: number
  event_type_value: string
  days: number
  days_before: number
  notify_leaders: boolean
  assign_task: boolean
  active_only: boolean
  cooldown_days: number
}

export interface AutomationTemplate {
  id: string
  title: string
  description: string
  icon: LucideIcon
  triggerKey: string
  fields: FieldKey[]
  // Per-preset defaults merged over the global defaults.
  defaults: Partial<RuleFormValues>
  inAppTitle: string
  dedupBucket: "day" | "week" | "none"
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "absence-follow-up",
    title: "Absence follow-up",
    description:
      "Reach out when a member misses several services in a row, so no one slips through the cracks.",
    icon: HeartHandshake,
    triggerKey: "member.consecutive_absences",
    fields: ["event_type_value", "threshold", "channel", "message", "notify_leaders", "assign_task", "active_only", "cooldown_days"],
    defaults: {
      name: "Absence follow-up",
      threshold: 3,
      event_type_value: "sunday-service",
      message: "Hi {{member.first_name}}, we missed you at {{event.label}} for {{count}} weeks. Everything okay? From all of us at {{org.name}}",
      cooldown_days: 30,
      active_only: true,
      notify_leaders: true,
      assign_task: true,
    },
    inAppTitle: "We miss you",
    dedupBucket: "week",
  },
  {
    id: "win-back",
    title: "Win back inactive members",
    description: "Nudge members who haven't attended anything for a while.",
    icon: UserX,
    triggerKey: "member.no_attendance_for_days",
    fields: ["days", "channel", "message", "notify_leaders", "active_only", "cooldown_days"],
    defaults: {
      name: "Win-back inactive members",
      days: 30,
      message: "Hi {{member.first_name}}, it's been a while. We'd love to see you again at {{org.name}}. 💛",
      cooldown_days: 45,
      active_only: true,
    },
    inAppTitle: "We'd love to see you",
    dedupBucket: "week",
  },
  {
    id: "low-engagement",
    title: "Low engagement score",
    description:
      "Reach out when a member's engagement score drops below a level you set. It catches a gradual drift, not just missed weeks. Needs engagement scoring, part of the Pro plan.",
    icon: TrendingDown,
    triggerKey: "member.engagement_score_below",
    fields: ["threshold", "channel", "message", "notify_leaders", "assign_task", "active_only", "cooldown_days"],
    defaults: {
      name: "Low engagement follow-up",
      threshold: 40,
      message: "Hi {{member.first_name}}, we've seen less of you lately and we'd love to reconnect. From all of us at {{org.name}}",
      cooldown_days: 30,
      active_only: true,
      notify_leaders: true,
      assign_task: true,
    },
    inAppTitle: "We'd love to reconnect",
    dedupBucket: "week",
  },
  {
    id: "birthday",
    title: "Birthday greeting",
    description: "Send a warm birthday message on a member's birthday.",
    icon: CalendarHeart,
    triggerKey: "member.birthday",
    fields: ["days_before", "channel", "message"],
    defaults: {
      name: "Birthday greeting",
      days_before: 0,
      message: "Happy birthday, {{member.first_name}}! 🎉 The {{org.name}} family celebrates you today.",
    },
    inAppTitle: "Happy birthday! 🎉",
    dedupBucket: "day",
  },
  {
    id: "welcome",
    title: "Welcome new member",
    description: "Greet a member as soon as they're added to the directory.",
    icon: UserPlus,
    triggerKey: "member.created",
    fields: ["channel", "message"],
    defaults: {
      name: "Welcome new member",
      message: "Welcome to {{org.name}}, {{member.first_name}}! We're so glad you're here.",
    },
    inAppTitle: "Welcome!",
    dedupBucket: "none",
  },
  {
    id: "late-nudge",
    title: "Late arrival nudge",
    description: "Gently follow up with members who check in after the service starts.",
    icon: Clock,
    triggerKey: "checkin.late",
    fields: ["channel", "message", "cooldown_days"],
    defaults: {
      name: "Late arrival nudge",
      message: "Glad you made it, {{member.first_name}}! Next time try to join us right at the start. 🙏",
      cooldown_days: 7,
    },
    inAppTitle: "Glad you made it",
    dedupBucket: "day",
  },
]

export const DEFAULT_FORM_VALUES: RuleFormValues = {
  name: "",
  message: "",
  channel: "in_app",
  threshold: 3,
  event_type_value: "",
  days: 30,
  days_before: 0,
  notify_leaders: false,
  assign_task: false,
  active_only: true,
  cooldown_days: 0,
}

export function getTemplate(id: string): AutomationTemplate | undefined {
  return AUTOMATION_TEMPLATES.find((t) => t.id === id)
}

export function templateForTrigger(triggerKey: string): AutomationTemplate | undefined {
  return AUTOMATION_TEMPLATES.find((t) => t.triggerKey === triggerKey)
}

// Variables available for interpolation, shown as insert chips in the editor.
export const TEMPLATE_VARIABLES: Array<{ token: string; label: string }> = [
  { token: "{{member.first_name}}", label: "First name" },
  { token: "{{member.name}}", label: "Full name" },
  { token: "{{count}}", label: "Absence count" },
  { token: "{{event.label}}", label: "Event name" },
  { token: "{{org.name}}", label: "Organization" },
]

// ---------------------------------------------------------------------------
// Compile tuned values -> backend rule payload
// ---------------------------------------------------------------------------

export interface RulePayload {
  name: string
  description?: string
  trigger_key: string
  trigger_params: Record<string, any>
  conditions?: any
  actions: Array<{ key: string; params?: Record<string, any> }>
  cooldown_days?: number
  dedup_bucket: string
  unit_ids?: string[]
}

export function buildRulePayload(
  template: AutomationTemplate,
  values: RuleFormValues,
  unitIds: string[],
): RulePayload {
  // Trigger params per trigger type.
  const trigger_params: Record<string, any> = {}
  if (template.triggerKey === "member.consecutive_absences") {
    trigger_params.threshold = values.threshold
    if (values.event_type_value) trigger_params.event_type_value = values.event_type_value
  } else if (template.triggerKey === "member.no_attendance_for_days") {
    trigger_params.days = values.days
  } else if (template.triggerKey === "member.birthday") {
    trigger_params.days_before = values.days_before
  } else if (template.triggerKey === "member.engagement_score_below") {
    trigger_params.threshold = values.threshold
  }

  // Primary send action.
  const actions: RulePayload["actions"] = []
  if (values.channel === "sms") {
    actions.push({ key: "send_sms", params: { template: values.message } })
  } else {
    actions.push({
      key: "send_in_app",
      params: { title: template.inAppTitle, template: values.message, category: "follow_up" },
    })
  }
  if (template.fields.includes("notify_leaders") && values.notify_leaders) {
    actions.push({
      key: "notify_leaders",
      params: { template: "{{member.name}} triggered “" + values.name + "”." },
    })
  }
  if (template.fields.includes("assign_task") && values.assign_task) {
    actions.push({
      key: "create_follow_up_task",
      params: { note: "{{member.name}} triggered “" + values.name + "” and needs a follow-up." },
    })
  }

  // Conditions.
  const children: any[] = []
  if (template.fields.includes("active_only") && values.active_only) {
    children.push({ op: "eq", field: "member.status", value: "active" })
  }
  if (values.channel === "sms") {
    children.push({ op: "has_contact", channel: "sms" })
  }
  const conditions = children.length > 0 ? { op: "and", children } : undefined

  return {
    name: values.name || template.title,
    description: template.description,
    trigger_key: template.triggerKey,
    trigger_params,
    conditions,
    actions,
    cooldown_days: template.fields.includes("cooldown_days") ? values.cooldown_days : undefined,
    dedup_bucket: template.dedupBucket,
    unit_ids: unitIds.length > 0 ? unitIds : undefined,
  }
}

// Best-effort reverse mapping for editing an existing rule.
export function ruleToFormValues(rule: any): { template?: AutomationTemplate; values: RuleFormValues; unitIds: string[] } {
  const template = templateForTrigger(rule.trigger_key)
  const params = rule.trigger_params || {}
  const actions = (rule.actions || []) as Array<{ key: string; params?: any }>
  const primary = actions.find((a) => a.key === "send_sms" || a.key === "send_in_app")
  const channel: Channel = primary?.key === "send_sms" ? "sms" : "in_app"
  const conditionChildren: any[] = rule.conditions?.children || []
  const activeOnly = conditionChildren.some(
    (c: any) => c.op === "eq" && c.field === "member.status" && c.value === "active",
  )

  const values: RuleFormValues = {
    ...DEFAULT_FORM_VALUES,
    ...(template?.defaults || {}),
    name: rule.name || template?.defaults.name || "",
    message: primary?.params?.template || "",
    channel,
    threshold: params.threshold ?? DEFAULT_FORM_VALUES.threshold,
    event_type_value: params.event_type_value ?? "",
    days: params.days ?? DEFAULT_FORM_VALUES.days,
    days_before: params.days_before ?? 0,
    notify_leaders: actions.some((a) => a.key === "notify_leaders"),
    assign_task: actions.some((a) => a.key === "create_follow_up_task"),
    active_only: activeOnly,
    cooldown_days: rule.cooldown_days ?? 0,
  }
  return { template, values, unitIds: rule.unit_ids || [] }
}

// Lightweight client-side preview of a template string (for the editor preview).
export function previewMessage(message: string, orgName: string): string {
  const sample: Record<string, string> = {
    "member.first_name": "Ama",
    "member.name": "Ama Mensah",
    count: "3",
    "event.label": "Sunday Service",
    "org.name": orgName || "your church",
  }
  return message.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, k) => sample[k] ?? "")
}
