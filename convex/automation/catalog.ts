// =============================================================================
// Automation catalog + shared types
//
// The *catalog* is the fixed, code-defined universe of triggers, conditions,
// and actions. Rules (stored in the DB) reference catalog entries by `key` and
// supply parameters. This is what keeps the engine flexible for admins without
// being a Turing-complete security hole: admins compose data, never code.
//
// Pure TypeScript, no Convex runtime imports, so it is safe to import from both
// backend functions and the frontend rule builder.
// =============================================================================

// ---------------------------------------------------------------------------
// Fact context — the data a trigger produces, against which conditions are
// evaluated and templates are rendered. Field paths in conditions/templates
// resolve against this object (e.g. "member.status", "streak.count").
// ---------------------------------------------------------------------------

export type MemberFacts = {
    id: string;
    name: string;
    first_name: string;
    status: string; // "active" | "inactive" | "visitor"
    gender?: string;
    email?: string;
    phone?: string;
    has_sms: boolean; // phone present and not a placeholder
    has_email: boolean;
    unit_ids: string[];
    label_ids: string[];
    age?: number;
    years_as_member?: number;
    engagement_score?: number; // 0-100, higher = more engaged. Undefined on Free orgs.
    engagement_risk_level?: string; // "low" | "medium" | "high" | "new"
    // Archived members never trigger automations. Not a condition field.
    archived?: boolean;
};

export type StreakFacts = {
    count: number; // consecutive absences
    last_present_date?: string;
    days_since_last?: number;
};

export type EventFacts = {
    event_type_id?: string;
    event_type_value?: string;
    label?: string;
    date?: string;
    is_late?: boolean;
    minutes_late?: number;
    source?: string;
};

export type OrgFacts = {
    id: string;
    name: string;
    timezone?: string;
};

export type FactContext = {
    org: OrgFacts;
    member?: MemberFacts;
    streak?: StreakFacts;
    event?: EventFacts;
};

// ---------------------------------------------------------------------------
// Condition DSL — a serializable predicate tree. No arbitrary code: only these
// registered operators over an allow-listed set of field paths.
// ---------------------------------------------------------------------------

export type Comparator = "eq" | "ne" | "lt" | "lte" | "gt" | "gte";

export type ConditionNode =
    | { op: "and"; children: ConditionNode[] }
    | { op: "or"; children: ConditionNode[] }
    | { op: "not"; child: ConditionNode }
    | { op: Comparator; field: string; value: string | number | boolean }
    | { op: "in" | "not_in"; field: string; value: (string | number)[] }
    | { op: "has_label"; label_id: string }
    | { op: "in_unit"; unit_ids: string[] }
    | { op: "has_contact"; channel: "sms" | "email" };

// Fields an admin may reference in a condition or {{template}}. Anything not
// listed resolves to undefined (and, for conditions, fails closed).
export const ALLOWED_FIELDS: readonly string[] = [
    "member.status",
    "member.gender",
    "member.age",
    "member.years_as_member",
    "member.has_sms",
    "member.has_email",
    "member.engagement_score",
    "member.engagement_risk_level",
    "streak.count",
    "streak.days_since_last",
    "event.event_type_value",
    "event.is_late",
    "event.minutes_late",
];

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type ActionKind = "transactional" | "dispatch";

export type ActionSpec = {
    key: string;
    label: string;
    kind: ActionKind;
    channel?: "sms" | "email" | "in_app" | "webhook" | "internal";
    description: string;
    // Free-form param descriptor for the UI; validated per-handler at runtime.
    params?: Record<string, string>;
};

// A concrete action instance on a rule.
export type RuleAction = {
    key: string;
    params?: Record<string, any>;
};

export const ACTION_CATALOG: readonly ActionSpec[] = [
    {
        key: "log_only",
        label: "Log only",
        kind: "transactional",
        channel: "internal",
        description: "Record a message_log entry without sending anything. Useful for analytics-only rules and testing.",
        params: { tag: "string" },
    },
    {
        key: "send_in_app",
        label: "Send in-app notification",
        kind: "transactional",
        channel: "in_app",
        description: "Deliver an in-app notification to the member's inbox.",
        params: { template: "string", title: "string", category: "string" },
    },
    {
        key: "add_label",
        label: "Add label",
        kind: "transactional",
        channel: "internal",
        description: "Assign a label to the member (e.g. needs-follow-up).",
        params: { label_id: "id:labels" },
    },
    {
        key: "remove_label",
        label: "Remove label",
        kind: "transactional",
        channel: "internal",
        description: "Remove a label from the member.",
        params: { label_id: "id:labels" },
    },
    {
        key: "send_sms",
        label: "Send SMS",
        kind: "dispatch",
        channel: "sms",
        description: "Send an SMS via the configured provider (mNotify). Respects consent, quiet hours, and rate caps. Logged as skipped_no_provider until credentials are set.",
        params: { template: "string", template_id: "id:automation_templates" },
    },
    {
        key: "send_email",
        label: "Send email",
        kind: "dispatch",
        channel: "email",
        description: "Send an email via the configured provider. (Provider wired in Phase 3.)",
        params: { subject: "string", template: "string", template_id: "id:automation_templates" },
    },
    {
        key: "notify_leaders",
        label: "Notify unit leaders",
        kind: "dispatch",
        channel: "internal",
        description: "Alert the member's unit leaders/admins (in-app in Phase 0).",
        params: { template: "string" },
    },
    {
        key: "create_follow_up_task",
        label: "Create follow-up task",
        kind: "transactional",
        channel: "internal",
        description: "Assign a tracked follow-up task to the member's unit leader (pending/contacted/resolved).",
        params: { note: "string" },
    },
] as const;

export function getActionSpec(key: string): ActionSpec | undefined {
    return ACTION_CATALOG.find((a) => a.key === key);
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export type TriggerKind = "event" | "derived";

export type TriggerSpec = {
    key: string;
    label: string;
    kind: TriggerKind;
    description: string;
    // Params an admin supplies (descriptor for the UI).
    params?: Record<string, string>;
    // Which fact namespaces this trigger populates (for the condition builder).
    facts: Array<"member" | "streak" | "event" | "org">;
};

export const TRIGGER_CATALOG: readonly TriggerSpec[] = [
    // --- Derived (evaluated by the daily scanner) ---
    {
        key: "member.consecutive_absences",
        label: "Member reaches N consecutive absences",
        kind: "derived",
        description: "Fires when a member has missed at least `threshold` consecutive applicable services.",
        params: { event_type_value: "string?", threshold: "number" },
        facts: ["member", "streak", "org"],
    },
    {
        key: "member.no_attendance_for_days",
        label: "Member has not attended for N days",
        kind: "derived",
        description: "Fires when a member's last attendance was at least `days` ago (or never).",
        params: { days: "number" },
        facts: ["member", "streak", "org"],
    },
    {
        key: "member.birthday",
        label: "Member birthday",
        kind: "derived",
        description: "Fires on (or `days_before` before) a member's birthday.",
        params: { days_before: "number?" },
        facts: ["member", "org"],
    },
    {
        key: "member.engagement_score_below",
        label: "Engagement score drops below N",
        kind: "derived",
        description: "Fires when a member's engagement/at-risk score is below `threshold`. Requires the Engagement Scoring Pro feature (scores are recomputed daily).",
        params: { threshold: "number" },
        facts: ["member", "org"],
    },
    // --- Event (emitted from existing mutations) ---
    {
        key: "member.created",
        label: "New member added",
        kind: "event",
        description: "Fires when a member record is created.",
        facts: ["member", "org"],
    },
    {
        key: "member.status_changed",
        label: "Member status changed",
        kind: "event",
        description: "Fires when a member's status changes.",
        facts: ["member", "org"],
    },
    {
        key: "attendance.marked_present",
        label: "Member marked present",
        kind: "event",
        description: "Fires when a member is marked present for a service.",
        facts: ["member", "event", "org"],
    },
    {
        key: "checkin.completed",
        label: "Check-in completed",
        kind: "event",
        description: "Fires when a member checks in (QR / kiosk / portal).",
        facts: ["member", "event", "org"],
    },
    {
        key: "checkin.late",
        label: "Late check-in",
        kind: "event",
        description: "Fires when a member checks in after the grace period.",
        facts: ["member", "event", "org"],
    },
    {
        key: "visitor.checked_in",
        label: "Visitor checked in",
        kind: "event",
        description: "Fires when a first-time visitor checks in.",
        facts: ["member", "event", "org"],
    },
] as const;

export function getTriggerSpec(key: string): TriggerSpec | undefined {
    return TRIGGER_CATALOG.find((t) => t.key === key);
}

export function isDerivedTrigger(key: string): boolean {
    return getTriggerSpec(key)?.kind === "derived";
}

// Message category inferred from the action, for the message_log.
export function categoryForAction(key: string): string {
    switch (key) {
        case "send_sms":
        case "send_email":
        case "send_in_app":
            return "follow_up";
        case "notify_leaders":
            return "alert";
        case "create_follow_up_task":
            return "follow_up";
        default:
            return "info";
    }
}
