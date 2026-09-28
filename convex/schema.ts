
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    users: defineTable({
        clerk_user_id: v.string(),
        email: v.optional(v.string()),
        name: v.optional(v.string()),
        role: v.string(), // 'super_admin', 'organization_admin', 'division_admin', 'unit_admin', 'sub_unit_admin'
        organization_id: v.optional(v.string()), // UUID from migration, keeping as string for now
        division_id: v.optional(v.string()),
        unit_id: v.optional(v.string()),
        // Org the user is currently browsing, if different from their home
        // `organization_id` — e.g. a parent-org admin viewing a sub-organization.
        // Ephemeral by convention (cleared on return-to-home); never used for
        // authorization, only to pick which org's data the UI shows.
        viewing_organization_id: v.optional(v.string()),
        active: v.boolean(),
    })
        .index("by_clerk_id", ["clerk_user_id"])
        .index("by_email", ["email"]),

    app_config: defineTable({
        key: v.string(),
        value: v.any(),
        category: v.optional(v.string()),
        updated_at: v.optional(v.string()),
    }).index("by_key", ["key"]),

    /**
     * An organization's own AI provider key ("bring your own key").
     *
     * The reason is data protection before it is cost. With a key of their own,
     * a church's pastoral notes and member details reach the model under the
     * church's contract, retention settings and region — a better answer to a
     * safeguarding question than "trust our agreement with a third party".
     * Cost attribution and rate-limit isolation follow, but they are not the
     * argument. See PASTORAL_CARE_COPILOT_PLAN.md §privacy.
     *
     * The key is encrypted at rest (convex/lib/secretBox.ts). The plaintext is
     * readable in exactly one place — the internal query the provider calls use
     * — and never by a client.
     */
    ai_credentials: defineTable({
        organization_id: v.id("organizations"),
        /** Which adapter to build. `openai` covers every OpenAI-compatible endpoint. */
        provider: v.union(v.literal("anthropic"), v.literal("openai")),
        ciphertext: v.string(),
        iv: v.string(),
        /**
         * The last four characters of the key, so the settings page can show
         * WHICH key is stored without decrypting anything to render itself.
         */
        hint: v.string(),
        /** Where to send it. Absent means the provider's own default. */
        base_url: v.optional(v.string()),
        /** Overrides the deployment's model choice for this organization. */
        model: v.optional(v.string()),
        status: v.union(v.literal("active"), v.literal("disabled")),
        /**
         * When it last worked, and what went wrong if it didn't. Between them
         * they answer "is this key still good?", which is the question an
         * administrator actually has and shouldn't have to run a drafting job
         * at 6am on a Sunday to find out.
         */
        last_used_at: v.optional(v.string()), // ISO timestamp
        last_error: v.optional(v.string()),
        created_by: v.optional(v.string()), // clerk_user_id
        created_at: v.string(),
        updated_at: v.string(),
    }).index("by_org_provider", ["organization_id", "provider"]),

    /**
     * Feature-flag overrides. The catalogue in `convex/lib/flags/catalog.ts` is
     * the source of truth for which flags EXIST; a row here only says what a
     * given flag has been set to, so a flag with no row still resolves (to its
     * declared default) and the console still lists it.
     *
     * A row with no `organization_id` is a deployment-wide override, written by
     * super admins. A row with one is that organization's override, and applies
     * only to flags declared `orgOverridable` — never to a kill switch, which is
     * refused at write time and ignored again at resolution time.
     */
    feature_flags: defineTable({
        key: v.string(),
        organization_id: v.optional(v.id("organizations")),
        enabled: v.boolean(),
        updated_at: v.string(), // ISO timestamp
        updated_by: v.optional(v.string()), // clerk_user_id
    })
        .index("by_key", ["key"])
        .index("by_org", ["organization_id"])
        .index("by_org_key", ["organization_id", "key"]),

    event_types: defineTable({
        value: v.string(),
        label: v.string(),
        color: v.optional(v.string()),
        icon: v.optional(v.string()),
        category: v.optional(v.string()),
        description: v.optional(v.string()),
        default_time: v.optional(v.string()), // Default time for events of this type (e.g., "09:00")
        default_duration_minutes: v.optional(v.number()), // Default session window length (e.g., 240)
        grace_minutes: v.optional(v.number()), // Minutes after start_time before a check-in is "late"
        is_active: v.boolean(),
        sort_order: v.number(),
        organization_id: v.optional(v.id("organizations")),
        // Unit scoping: if unit_ids is set, this event only applies to members of those units
        // If empty/undefined, the event applies to all members
        unit_ids: v.optional(v.array(v.id("units"))),
    })
        .index("by_value", ["value"])
        .index("by_org", ["organization_id"])
        .index("by_org_and_value", ["organization_id", "value"]),

    // Legacy regions table removed - now handled by units with type "geographic"

    features: defineTable({
        name: v.string(),
        isEnabled: v.boolean(),
        description: v.optional(v.string()),
    }),

    organizations: defineTable({
        name: v.string(),
        description: v.optional(v.string()),
        active: v.boolean(),
        organization_admin_id: v.optional(v.string()),
        // Org-to-org hierarchy (a parent org overseeing sub-organizations).
        // Self-referencing, same materialized-path pattern as `units`. A
        // sub-organization keeps its own admins/subscription/data untouched;
        // `parent_organization_id` only grants the ancestor's org admins
        // cascading read/write access (see auth.ts descendant-org checks).
        parent_organization_id: v.optional(v.id("organizations")),
        depth: v.optional(v.number()), // 0 = top of its own tree
        path: v.optional(v.string()), // materialized path, e.g. "/parentId/childId"
        // One persistent, rotatable code an org shares so another org's admin
        // can self-link under it (e.g. "ORG-UCG4X"). Redeeming it always
        // attaches the redeemer's OWN org (they must be its admin), so a
        // leaked code can never pull in an org the holder doesn't run.
        invite_code: v.optional(v.string()),
        // Hierarchy configuration
        level1_singular: v.optional(v.string()),
        level1_plural: v.optional(v.string()),
        level2_singular: v.optional(v.string()),
        level2_plural: v.optional(v.string()),
        level3_singular: v.optional(v.string()),
        level3_plural: v.optional(v.string()),
        level4_singular: v.optional(v.string()),
        level4_plural: v.optional(v.string()),
        // Check-in / portal configuration
        timezone: v.optional(v.string()), // IANA tz, e.g. "Africa/Accra"
        // ISO 4217 code the church keeps its books in. Unset reads as GHS, the
        // currency online giving settles in (convex/paystack.ts).
        currency: v.optional(v.string()),
        hq_latitude: v.optional(v.number()),
        hq_longitude: v.optional(v.number()),
        // Brand colour. ONE hex is stored; the dozen CSS variables it becomes
        // are derived on read by convex/lib/theme/brand.ts, shared by the app
        // and the settings preview. Storing the resolved palette would be
        // faster and would fork the design system per tenant, one row at a
        // time — a later improvement to the derivation (or a change to the
        // surfaces it is contrast-checked against) would leave existing
        // customers on a palette that no longer clears AA.
        theme: v.optional(
            v.object({
                brandHex: v.string(),
                /** Which preset it came from, if any — for re-selecting it in the UI. */
                presetId: v.optional(v.string()),
                updatedAt: v.string(), // ISO timestamp
            }),
        ),
    })
        .index("by_parent", ["parent_organization_id"])
        .index("by_path", ["path"])
        .index("by_invite_code", ["invite_code"]),

    // Nested organizational units with types
    units: defineTable({
        name: v.string(),
        description: v.optional(v.string()),
        organization_id: v.id("organizations"),
        parent_unit_id: v.optional(v.id("units")), // Self-referencing for nesting
        type: v.string(), // 'organization', 'administrative', 'functional', 'geographic'
        category: v.optional(v.string()), // Additional classification
        leader_id: v.optional(v.id("members")),
        depth: v.optional(v.number()), // 0 = root level under organization
        path: v.optional(v.string()), // Materialized path for efficient queries, e.g., "/org/admin-church-a/youth"
        active: v.boolean(),
        // Legacy fields for migration
        parent_organization_type: v.optional(v.string()),
        division_id: v.optional(v.string()),
        // Location data
        address: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        country: v.optional(v.string()),
        latitude: v.optional(v.number()),
        longitude: v.optional(v.number()),
        plus_code: v.optional(v.string()),
        // Template inheritance: set when this unit was provisioned from a
        // template (see unit_templates). `template_overrides` lists the field
        // names customized locally, which template-edit propagation must skip.
        source_template_id: v.optional(v.id("unit_templates")),
        template_overrides: v.optional(v.array(v.string())),
    })
        .index("by_org", ["organization_id"])
        .index("by_parent", ["parent_unit_id"])
        .index("by_type", ["type"])
        .index("by_org_type", ["organization_id", "type"])
        .index("by_path", ["path"])
        .index("by_source_template", ["source_template_id"]),

    // Reusable unit blueprints. A template is NOT a real unit (no members,
    // attendance, or tree position) — it's a definition that gets instantiated
    // as units. `cascade_to_sub_orgs` auto-provisions one instance into every
    // descendant org in the org tree. Instances link back via
    // units.source_template_id and keep a living link: template edits propagate
    // to non-overridden instance fields.
    unit_templates: defineTable({
        organization_id: v.id("organizations"), // the org that DEFINES the template
        name: v.string(),
        description: v.optional(v.string()),
        type: v.string(), // 'administrative' | 'functional' | 'geographic'
        category: v.optional(v.string()),
        cascade_to_sub_orgs: v.boolean(),
        active: v.boolean(),
    })
        .index("by_org", ["organization_id"]),

    terminologies: defineTable({
        organization_id: v.id("organizations"),
        division_id: v.optional(v.id("divisions")),
        unit_id: v.optional(v.id("units")),
        level: v.string(), // 'organization', 'division', 'unit'
        unit_term: v.optional(v.string()),
        unit_term_plural: v.optional(v.string()),
        unit_leader_term: v.optional(v.string()),
        division_term: v.optional(v.string()),
        division_term_plural: v.optional(v.string()),
        division_leader_term: v.optional(v.string()),
    })
        .index("by_org", ["organization_id"])
        .index("by_division", ["division_id"])
        .index("by_unit", ["unit_id"]),

    members: defineTable({
        name: v.string(),
        other_names: v.optional(v.string()), // Additional names when multiple names provided
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        status: v.string(), // 'active', 'inactive', 'visitor'
        dob: v.optional(v.string()),
        birth_month: v.optional(v.number()),
        birth_day: v.optional(v.number()),
        gender: v.optional(v.string()),
        marital_status: v.optional(v.string()),
        anniversary: v.optional(v.string()),
        organization_id: v.optional(v.id("organizations")),
        division_id: v.optional(v.id("divisions")),
        // Removed single unit_id - now using member_units junction table
        // App access for church members vs app users distinction
        app_access: v.optional(v.boolean()), // true = can login to app, false/null = church member only
        app_access_granted_date: v.optional(v.string()),
        app_access_granted_by: v.optional(v.string()), // clerk_user_id of who granted access
        // Address fields
        address: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        zip: v.optional(v.string()),
        country: v.optional(v.string()),
        latitude: v.optional(v.number()),
        longitude: v.optional(v.number()),
        plus_code: v.optional(v.string()),
        avatar_url: v.optional(v.string()),
        user_id: v.optional(v.id("users")),
        joined_date: v.optional(v.string()),
        skills: v.optional(v.string()),
        // Household this member belongs to (optional; members without one
        // behave exactly as before households existed).
        household_id: v.optional(v.id("households")),
        // Engagement/at-risk score (Pro feature), recomputed daily by
        // convex/engagement/recompute.ts. Denormalized so members.listPage's
        // in-memory sort/filter can use it cheaply — see engagement_score's
        // by_org_and_engagement_score index below. Undefined on Free orgs
        // (the recompute job skips them) and until the first run completes.
        engagement_score: v.optional(v.number()), // 0-100, higher = more engaged
        engagement_risk_level: v.optional(v.string()), // "low" | "medium" | "high" | "new"
        engagement_breakdown: v.optional(v.string()), // JSON: per-signal sub-scores, for the profile UI
        engagement_computed_at: v.optional(v.string()), // ISO timestamp
        // Timestamps
        created_at: v.optional(v.string()), // ISO timestamp
        updated_at: v.optional(v.string()), // ISO timestamp
        // Soft delete / archive: undefined = active
        archived_at: v.optional(v.string()), // ISO timestamp
        archived_by: v.optional(v.string()), // clerk_user_id of who archived
    })
        .index("by_org", ["organization_id"])
        .index("by_email", ["email"])
        .index("by_org_status", ["organization_id", "status"])
        .index("by_user_id", ["user_id"])
        .index("by_org_and_phone", ["organization_id", "phone"])
        .index("by_household", ["household_id"])
        .index("by_org_and_engagement_score", ["organization_id", "engagement_score"]),

    // Admins/leaders of a unit (many-to-many). Source of truth for unit-level
    // admin access. Always contains the primary leader (role "leader") plus any
    // number of additional admins (role "admin"). `units.leader_id` mirrors the
    // primary leader for display/back-compat.
    unit_admins: defineTable({
        unit_id: v.id("units"),
        member_id: v.id("members"),
        organization_id: v.id("organizations"), // denormalized for scoping/cleanup
        role: v.string(), // 'leader' (primary) | 'admin' (assistant)
        added_by: v.optional(v.string()), // clerk_user_id of who granted access
        is_active: v.boolean(),
    })
        .index("by_unit", ["unit_id"])
        .index("by_member", ["member_id"])
        .index("by_unit_member", ["unit_id", "member_id"])
        .index("by_org", ["organization_id"]),

    // Many-to-many relationship between members and units
    member_units: defineTable({
        member_id: v.id("members"),
        unit_id: v.id("units"),
        joined_date: v.optional(v.string()), // When they joined this specific unit
        role: v.optional(v.string()), // Optional role in this unit (e.g., "singer", "leader")
        is_active: v.boolean(), // Whether they're currently active in this unit
    })
        .index("by_member", ["member_id"])
        .index("by_unit", ["unit_id"])
        .index("by_member_unit", ["member_id", "unit_id"]),


    member_labels: defineTable({
        member_id: v.id("members"),
        label_id: v.id("labels"),
        assigned_by: v.optional(v.string()), // clerk_user_id
        assigned_by_name: v.optional(v.string()),
    })
        .index("by_member", ["member_id"])
        .index("by_label", ["label_id"]),

    // Legacy organizational structures removed - now handled by units table


    events: defineTable({
        title: v.string(),
        date: v.string(), // ISO date string
        description: v.optional(v.string()),
        event_type_id: v.optional(v.id("event_types")),
        time: v.optional(v.string()),
        location: v.optional(v.string()),
        active: v.boolean(),
        organization_id: v.optional(v.id("organizations")),
    }).index("by_date", ["date"]).index("by_org", ["organization_id"]),

    attendance: defineTable({
        date: v.string(),
        count: v.number(),
        notes: v.optional(v.string()),
        event_id: v.optional(v.id("events")),
        event_type_id: v.optional(v.id("event_types")), // Link to event_types
        organization_id: v.optional(v.id("organizations")),
    })
        .index("by_date", ["date"])
        .index("by_org", ["organization_id"])
        .index("by_org_and_date", ["organization_id", "date"]),

    member_attendance: defineTable({
        member_id: v.id("members"),
        attendance_id: v.id("attendance"),
        // Check-in metadata (all optional so existing manual rows stay valid)
        source: v.optional(v.string()), // "manual" | "qr" | "kiosk" | "portal" | "geofence"
        checked_in_at: v.optional(v.string()), // ISO datetime of the check-in action
        checked_in_by: v.optional(v.id("users")), // who marked (admin id; null for self-service)
        check_in_session_id: v.optional(v.id("check_in_sessions")),
        is_late: v.optional(v.boolean()),
        minutes_late: v.optional(v.number()),
        device_info: v.optional(v.string()),
        location_lat: v.optional(v.number()),
        location_long: v.optional(v.number()),
    })
        .index("by_attendance", ["attendance_id"])
        .index("by_member", ["member_id"])
        // Idempotency: one (attendance, member) row max. Critical for "already checked in".
        .index("by_attendance_and_member", ["attendance_id", "member_id"])
        .index("by_member_and_attendance", ["member_id", "attendance_id"])
        .index("by_check_in_session", ["check_in_session_id"]),

    // Public, token-gated links for sharing an event's absent-member list
    // with people who don't have app accounts (e.g. follow-up volunteers).
    absent_member_shares: defineTable({
        organization_id: v.id("organizations"),
        event_type_value: v.string(),
        date: v.string(), // yyyy-MM-dd
        token: v.string(),
        created_by: v.optional(v.string()), // clerk_user_id
        expires_at: v.optional(v.number()),
        revoked: v.boolean(),
        // The filters on screen when the link was made, so the link shows the
        // same list. Links made before these existed mean: every unit, active
        // members and visitors, any number missed.
        unit_id: v.optional(v.id("units")),
        statuses: v.optional(v.array(v.string())),
        min_consecutive: v.optional(v.number()),
    })
        .index("by_token", ["token"])
        .index("by_org_event_date", ["organization_id", "event_type_value", "date"]),

    // Public, link-shared snapshot of a members directory list. The matching
    // member ids are frozen at creation time (so the link can't widen as the
    // directory grows, and a unit leader's link can never resolve beyond the
    // scope they had), while the member details themselves are read live, so
    // a corrected phone number reaches everyone holding the link.
    member_list_shares: defineTable({
        organization_id: v.id("organizations"),
        token: v.string(),
        title: v.string(),
        // Human-readable summary of the filters the list was built from.
        description: v.optional(v.string()),
        member_ids: v.array(v.id("members")),
        // Whitelisted optional columns (see MEMBER_SHARE_COLUMNS); `name` is
        // always included and never listed here.
        columns: v.array(v.string()),
        created_by: v.optional(v.string()), // clerk_user_id
        created_by_name: v.optional(v.string()),
        expires_at: v.optional(v.number()),
        revoked: v.boolean(),
    })
        .index("by_token", ["token"])
        .index("by_org", ["organization_id"]),

    labels: defineTable({
        name: v.string(),
        description: v.optional(v.string()),
        category: v.optional(v.string()),
        color: v.string(),
        is_system_label: v.boolean(),
        is_active: v.boolean(),
        created_by: v.optional(v.string()),
        created_by_name: v.optional(v.string()),
        organization_id: v.optional(v.id("organizations")),
    }).index("by_org", ["organization_id"]),

    invitations: defineTable({
        email: v.string(),
        member_id: v.optional(v.id("members")),
        invited_by: v.optional(v.string()), // clerk_user_id
        intended_role: v.string(),
        intended_units: v.optional(v.array(v.string())), // Using string to store IDs from client 
        invitation_token: v.string(),
        status: v.string(), // 'pending', 'accepted', 'revoked'
        expires_at: v.optional(v.number()),
        organization_id: v.id("organizations"),
    }).index("by_token", ["invitation_token"]).index("by_email", ["email"]).index("by_org", ["organization_id"]),

    financial_transactions: defineTable({
        type: v.string(), // 'income' | 'expense'
        category: v.string(),
        amount: v.number(),
        description: v.string(),
        date: v.string(),
        payment_method: v.string(),
        member_id: v.optional(v.id("members")),
        member_name: v.optional(v.string()),
        event_id: v.optional(v.id("events")),
        event_name: v.optional(v.string()),
        recorded_by: v.string(), // clerk_user_id
        recorded_by_name: v.string(),
        notes: v.optional(v.string()),
        receipt_url: v.optional(v.string()),
        organization_id: v.optional(v.id("organizations")),
        // Online giving (Paystack checkout). Absent/undefined on every
        // manually-entered row = "completed", for backward compatibility —
        // only rows created by the online-giving checkout flow start as
        // "pending" and are flipped by the webhook, or "voided" via
        // voidTransaction (financial.ts no longer hard-deletes real money).
        status: v.optional(v.string()), // "pending" | "completed" | "failed" | "voided"
        payment_reference: v.optional(v.string()), // Paystack transaction reference
        voided_at: v.optional(v.string()),
        voided_by: v.optional(v.string()), // clerk_user_id
        void_reason: v.optional(v.string()),
        // Guest giver info (public /give link, no member record required).
        giver_name: v.optional(v.string()),
        giver_email: v.optional(v.string()),
        giver_phone: v.optional(v.string()),
    })
        .index("by_org", ["organization_id"])
        .index("by_date", ["date"])
        .index("by_member", ["member_id"])
        .index("by_payment_reference", ["payment_reference"]),

    service_financial_summaries: defineTable({
        service_date: v.string(),
        service_type: v.string(),
        service_name: v.optional(v.string()),
        event_id: v.optional(v.id("events")),
        total_attendance: v.number(),
        tithe_payers: v.number(),
        total_tithes: v.number(),
        total_offerings: v.number(),
        total_donations: v.number(),
        special_offerings: v.optional(v.number()),
        special_offering_description: v.optional(v.string()),
        // Payment method breakdown
        tithes_cash: v.number(),
        tithes_electronic: v.number(),
        offerings_cash: v.number(),
        offerings_electronic: v.number(),
        donations_cash: v.number(),
        donations_electronic: v.number(),
        special_offerings_cash: v.optional(v.number()),
        special_offerings_electronic: v.optional(v.number()),
        currency: v.string(),
        recorded_by: v.string(),
        recorded_by_name: v.string(),
        witnessed_by: v.optional(v.string()),
        witnessed_by_name: v.optional(v.string()),
        notes: v.optional(v.string()),
        organization_id: v.optional(v.id("organizations")),
    }).index("by_org", ["organization_id"]).index("by_date", ["service_date"]),

    service_metadata_summaries: defineTable({
        service_date: v.string(),
        service_type: v.string(),
        service_name: v.optional(v.string()),
        event_id: v.optional(v.id("events")),
        message_title: v.optional(v.string()),
        message_category: v.optional(v.string()),
        preacher_id: v.optional(v.id("members")),
        preacher_name: v.optional(v.string()),
        attendance_adults: v.number(),
        attendance_children: v.number(),
        attendance_total: v.number(),
        first_timers: v.number(),
        new_converts: v.number(),
        tithe_payers: v.number(),
        verified_by_id: v.optional(v.string()),
        verified_by_name: v.optional(v.string()),
        verification_date: v.optional(v.string()),
        notes: v.optional(v.string()),
        recorded_by: v.string(),
        recorded_by_name: v.string(),
        organization_id: v.optional(v.id("organizations")),
    }).index("by_org", ["organization_id"]).index("by_date", ["service_date"]),

    // Audit trail for tracking important actions
    audit_logs: defineTable({
        action: v.string(), // e.g., 'member.created', 'user.role_changed', 'financial.transaction_added'
        entity_type: v.string(), // e.g., 'member', 'user', 'event', 'financial_transaction'
        entity_id: v.optional(v.string()), // ID of the affected entity
        entity_name: v.optional(v.string()), // Name/description of the affected entity
        performed_by: v.string(), // clerk_user_id of who performed the action
        performed_by_name: v.string(), // Name of who performed the action
        performed_by_role: v.string(), // Role of who performed the action
        organization_id: v.optional(v.id("organizations")),
        // Details about the change
        changes: v.optional(v.any()), // JSON object with before/after values
        metadata: v.optional(v.any()), // Additional context (IP, user agent, etc.)
        ip_address: v.optional(v.string()),
        timestamp: v.string(), // ISO timestamp
    })
        .index("by_org", ["organization_id"])
        .index("by_action", ["action"])
        .index("by_entity", ["entity_type", "entity_id"])
        .index("by_performer", ["performed_by"])
        .index("by_timestamp", ["timestamp"])
        .index("by_org_timestamp", ["organization_id", "timestamp"]),

    // Check-in sessions: one per (org, event_type, date). Holds the opaque QR
    // token (hashed), lifecycle status, optional geofence, and a denormalized
    // check-in count for the live admin UI. References attendance as the
    // source of truth; deleting a session never deletes attendance.
    check_in_sessions: defineTable({
        organization_id: v.id("organizations"),
        attendance_id: v.optional(v.id("attendance")),
        event_type_id: v.id("event_types"),
        event_id: v.optional(v.id("events")),
        date: v.string(), // ISO date (YYYY-MM-DD), the session's service date
        token_hash: v.string(), // SHA-256 hex of opaque token; never store raw token
        token_algo: v.optional(v.string()), // "sha256" default; allows future rotation
        status: v.string(), // "draft" | "open" | "closed" | "expired" | "revoked"
        opens_at: v.string(), // ISO datetime (UTC)
        closes_at: v.string(), // ISO datetime (UTC)
        created_by: v.id("users"),
        created_by_name: v.optional(v.string()),
        created_at: v.string(),
        closed_at: v.optional(v.string()),
        closed_by: v.optional(v.id("users")),
        // Geofence (optional)
        location_mode: v.optional(v.string()), // "none" | "soft" | "strict"
        latitude: v.optional(v.number()),
        longitude: v.optional(v.number()),
        radius_meters: v.optional(v.number()),
        // Display
        display_name: v.optional(v.string()),
        // Denormalized live counter (updated on each check-in)
        check_in_count: v.optional(v.number()),
    })
        .index("by_org_and_date", ["organization_id", "date"])
        .index("by_attendance", ["attendance_id"])
        .index("by_token_hash", ["token_hash"])
        .index("by_org_and_status", ["organization_id", "status"])
        .index("by_event_type_and_date", ["event_type_id", "date"])
        .index("by_status", ["status"]),

    // Per-attempt audit for check-ins. High-churn operational data kept in its
    // own table (per Convex guideline) so it doesn't bloat general audit_logs
    // scans. Every attempt (success + every failure reason) is logged here,
    // giving an observable check-in funnel.
    check_in_audit: defineTable({
        session_id: v.id("check_in_sessions"),
        organization_id: v.id("organizations"),
        member_id: v.optional(v.id("members")),
        member_name: v.optional(v.string()),
        clerk_user_id: v.optional(v.string()), // who attempted (authenticated)
        method: v.string(), // "qr" | "portal" | "kiosk" | "manual"
        outcome: v.string(), // "success" | "already_checked_in" | "session_closed" | "expired" | "forbidden" | "outside_geofence" | "error" | ...
        reason: v.optional(v.string()),
        ip_address: v.optional(v.string()),
        device_info: v.optional(v.string()),
        timestamp: v.string(),
    })
        .index("by_session", ["session_id"])
        .index("by_org_timestamp", ["organization_id", "timestamp"])
        .index("by_member_timestamp", ["member_id", "timestamp"])
        .index("by_outcome", ["outcome"]),

    // Per-organization subscription to a sotf plan (e.g. Free vs Pro), backed by
    // Paystack. Keyed by organization so an entire church shares one plan. The
    // row is the source of truth for entitlements; Paystack webhooks keep it in
    // sync via convex/http.ts. No offline license signing (unlike Selah) — the
    // web client reads this row directly.
    subscriptions: defineTable({
        organization_id: v.id("organizations"),
        // Purchaser email (lowercased); used to resolve the org on webhooks.
        email: v.string(),
        plan: v.union(v.literal("free"), v.literal("pro")),
        status: v.union(
            v.literal("active"),
            v.literal("non-renewing"),
            v.literal("attention"),
            v.literal("past_due"),
            v.literal("cancelled")
        ),
        paystackCustomerCode: v.optional(v.string()),
        paystackSubscriptionCode: v.optional(v.string()),
        paystackPlanCode: v.optional(v.string()),
        // Parent-org license: when true, this subscription confers Pro on ALL
        // descendant orgs in the org tree (sub-organizations under this one),
        // not just this org. A sub-organization's own active subscription still
        // takes priority; ancestor coverage is the fallback. See entitlements.ts
        // orgIsPro, which walks parent_organization_id to honor this.
        covers_descendants: v.optional(v.boolean()),
        // ISO end of the current paid period; null on free / no period yet.
        currentPeriodEnd: v.optional(v.union(v.string(), v.null())),
        lastEventAt: v.optional(v.string()),
        lastChargeAt: v.optional(v.string()),
        createdAt: v.string(),
        updatedAt: v.string(),
    })
        .index("by_org", ["organization_id"])
        .index("by_email", ["email"])
        .index("by_subscription_code", ["paystackSubscriptionCode"]),

    // Explicit link between a Clerk users account and a members record, for
    // portal access. Today linkage is implicit (members.user_id or email
    // match); this makes it auditable and supports multi-org members later
    // (one row per org-member pair).
    member_portal_links: defineTable({
        member_id: v.id("members"),
        organization_id: v.id("organizations"),
        clerk_user_id: v.string(),
        linked_by: v.optional(v.string()), // "self_email" | "invitation" | "admin"
        linked_at: v.string(),
        revoked_at: v.optional(v.string()),
    })
        .index("by_member", ["member_id"])
        .index("by_clerk_user", ["clerk_user_id"])
        .index("by_org", ["organization_id"]),

    // In-app notifications for the signed-in user (care tasks, invites, system).
    notifications: defineTable({
        clerk_user_id: v.string(),
        organization_id: v.optional(v.id("organizations")),
        type: v.string(), // e.g. "system" | "care" | "invite" | "billing" | "check_in"
        title: v.string(),
        body: v.optional(v.string()),
        href: v.optional(v.string()), // optional deep link in the app
        read_at: v.optional(v.string()), // ISO; undefined = unread
        created_at: v.string(),
        metadata: v.optional(v.any()),
    })
        .index("by_user", ["clerk_user_id"])
        .index("by_user_created", ["clerk_user_id", "created_at"])
        .index("by_org", ["organization_id"]),

    // =======================================================================
    // AUTOMATION ENGINE ("If-This-Then-That")
    //
    // A data-driven rule engine: rules reference a code-defined catalog of
    // triggers/conditions/actions and supply parameters. Evaluation is
    // transactional (mutations); delivery is decoupled via automation_tasks so
    // a flaky provider never blocks a source write. See AUTOMATION_ENGINE_PLAN.md.
    // =======================================================================

    // The rule definition. condition/action trees are small bounded JSON.
    automation_rules: defineTable({
        organization_id: v.id("organizations"),
        name: v.string(),
        description: v.optional(v.string()),
        trigger_key: v.string(), // catalog key, e.g. "member.consecutive_absences"
        trigger_params: v.optional(v.any()), // { event_type_value, threshold, ... }
        conditions: v.optional(v.any()), // Condition tree (bounded)
        actions: v.array(v.any()), // [{ key, params }] ordered, small
        // Scope: empty/undefined unit_ids => whole org
        unit_ids: v.optional(v.array(v.id("units"))),
        // Guardrails
        cooldown_days: v.optional(v.number()),
        dedup_bucket: v.optional(v.string()), // "day" | "week" | "none"
        respect_quiet_hours: v.optional(v.boolean()),
        // Lifecycle
        status: v.string(), // "draft" | "enabled" | "paused"
        dry_run: v.optional(v.boolean()),
        priority: v.optional(v.number()),
        created_by: v.string(), // clerk_user_id
        created_by_name: v.optional(v.string()),
        created_at: v.string(),
        updated_at: v.optional(v.string()),
        last_run_at: v.optional(v.string()),
    })
        .index("by_org", ["organization_id"])
        .index("by_org_and_trigger", ["organization_id", "trigger_key"])
        .index("by_org_and_status", ["organization_id", "status"]),

    // Reusable message templates ({{variable}} interpolation).
    automation_templates: defineTable({
        organization_id: v.id("organizations"),
        name: v.string(),
        channel: v.string(), // "sms" | "email" | "in_app"
        subject: v.optional(v.string()), // email only
        body: v.string(),
        is_active: v.boolean(),
    })
        .index("by_org", ["organization_id"])
        .index("by_org_and_channel", ["organization_id", "channel"]),

    // Event inbox for push triggers. Decouples the source mutation from
    // evaluation (source only inserts a row + schedules processing).
    automation_events: defineTable({
        organization_id: v.id("organizations"),
        trigger_key: v.string(),
        subject_member_id: v.optional(v.id("members")),
        payload: v.optional(v.any()), // bounded fact seed
        status: v.string(), // "pending" | "processed" | "error"
        error: v.optional(v.string()),
        created_at: v.string(),
    })
        .index("by_status", ["status"])
        .index("by_org_and_status", ["organization_id", "status"]),

    // Task queue: the transactional -> delivery handoff. One row per action.
    automation_tasks: defineTable({
        organization_id: v.id("organizations"),
        rule_id: v.id("automation_rules"),
        run_id: v.optional(v.id("automation_runs")),
        member_id: v.optional(v.id("members")),
        action_key: v.string(),
        action_params: v.optional(v.any()),
        channel: v.optional(v.string()),
        // Pre-rendered payload from the fact context (so the dispatcher needs no re-eval)
        rendered: v.optional(v.any()), // { body?, subject?, label_id?, ... }
        dedup_key: v.string(),
        status: v.string(), // "pending" | "sent" | "deferred" | "failed" | "deduped" | "suppressed" | "dry_run" | "skipped_no_provider"
        attempts: v.number(),
        next_attempt_at: v.optional(v.string()), // backoff / quiet-hours defer
        dry_run: v.optional(v.boolean()),
        created_at: v.string(),
        processed_at: v.optional(v.string()),
        last_error: v.optional(v.string()),
    })
        .index("by_status", ["status"])
        .index("by_status_and_channel", ["status", "channel"])
        .index("by_status_and_next_attempt", ["status", "next_attempt_at"])
        .index("by_dedup_key", ["dedup_key"])
        .index("by_rule", ["rule_id"])
        .index("by_run", ["run_id"]),

    // Cooldown / streak / last-fired state per (rule, member). Prevents re-nagging.
    automation_state: defineTable({
        organization_id: v.id("organizations"),
        rule_id: v.id("automation_rules"),
        member_id: v.id("members"),
        last_fired_at: v.optional(v.string()),
        last_value: v.optional(v.any()), // e.g. last streak count seen
    })
        .index("by_rule_and_member", ["rule_id", "member_id"])
        .index("by_org", ["organization_id"]),

    // A run = one evaluation of one rule against one subject (observability).
    automation_runs: defineTable({
        organization_id: v.id("organizations"),
        rule_id: v.id("automation_rules"),
        trigger_key: v.string(),
        matched: v.boolean(),
        subject_member_id: v.optional(v.id("members")),
        actions_queued: v.number(),
        dry_run: v.boolean(),
        source: v.optional(v.string()), // "scan" | "event" | "simulate"
        note: v.optional(v.string()),
        started_at: v.string(),
    })
        .index("by_org", ["organization_id"])
        .index("by_rule", ["rule_id"]),

    // High-churn per-message delivery log (mirrors check_in_audit).
    message_log: defineTable({
        organization_id: v.id("organizations"),
        member_id: v.optional(v.id("members")),
        rule_id: v.optional(v.id("automation_rules")),
        channel: v.string(), // "sms" | "email" | "in_app" | "webhook" | "internal"
        dedup_key: v.optional(v.string()),
        category: v.string(), // "follow_up" | "reminder" | "alert" | "info"
        outcome: v.string(), // "sent" | "failed" | "deduped" | "throttled" | "suppressed_consent" | "quiet_hours_deferred" | "dry_run" | "skipped_no_provider"
        provider: v.optional(v.string()),
        provider_message_id: v.optional(v.string()),
        error: v.optional(v.string()),
        rendered_preview: v.optional(v.string()),
        sent_at: v.string(),
    })
        .index("by_org_and_sent_at", ["organization_id", "sent_at"])
        .index("by_member_and_sent_at", ["member_id", "sent_at"])
        .index("by_dedup_key", ["dedup_key"])
        .index("by_outcome", ["outcome"]),

    // Per-member channel consent + optional quiet-hours override.
    member_messaging_prefs: defineTable({
        member_id: v.id("members"),
        organization_id: v.id("organizations"),
        sms_opt_out: v.optional(v.boolean()),
        email_opt_out: v.optional(v.boolean()),
        quiet_start: v.optional(v.string()), // "22:00"
        quiet_end: v.optional(v.string()), // "07:00"
    })
        .index("by_member", ["member_id"])
        .index("by_org", ["organization_id"]),

    // In-app inbox (send_in_app action + member portal).
    in_app_notifications: defineTable({
        organization_id: v.id("organizations"),
        member_id: v.id("members"),
        title: v.string(),
        body: v.string(),
        category: v.string(),
        rule_id: v.optional(v.id("automation_rules")),
        read: v.boolean(),
        created_at: v.string(),
    })
        .index("by_member_and_read", ["member_id", "read"])
        .index("by_org", ["organization_id"]),

    // =======================================================================
    // CARE PIPELINE — assignment tracking
    //
    // Ownership tracking on top of the automation engine's detection/notify
    // path: who is following up on an at-risk/absent member, and what
    // happened. Created manually (absent-members UI) or by the automation
    // engine's create_follow_up_task action.
    // =======================================================================

    // One row per follow-up assignment, tracked to resolution.
    care_tasks: defineTable({
        organization_id: v.id("organizations"),
        member_id: v.id("members"), // who needs follow-up
        assigned_to: v.id("members"), // the leader/care-taker
        status: v.string(), // "pending" | "contacted" | "resolved"
        source: v.string(), // "manual" | "automation"
        rule_id: v.optional(v.id("automation_rules")),
        created_by: v.optional(v.string()), // clerk_user_id, manual creation only
        created_at: v.string(),
        updated_at: v.string(),
        // When the task first moved to "contacted" — the intervention moment,
        // distinct from resolved_at. Used for care-loop timing/attribution.
        contacted_at: v.optional(v.string()),
        // Engagement snapshot at creation — the at-risk baseline this follow-up
        // is meant to move. Compared against the member's current level to
        // attribute recoveries (see engagement/impact.ts). Undefined on Free
        // orgs / members with no score yet.
        member_score_at_contact: v.optional(v.number()),
        member_risk_at_contact: v.optional(v.string()),
        resolved_at: v.optional(v.string()),
    })
        .index("by_org", ["organization_id"])
        .index("by_member", ["member_id"])
        .index("by_assigned_to_and_status", ["assigned_to", "status"])
        .index("by_org_and_status", ["organization_id", "status"]),

    // Outcome/status-change log per task — this is the member timeline entry.
    // The first row (status "pending") captures why the task was created.
    care_task_notes: defineTable({
        care_task_id: v.id("care_tasks"),
        organization_id: v.id("organizations"),
        status: v.string(), // status as of this entry
        note: v.optional(v.string()),
        created_by: v.optional(v.string()), // clerk_user_id; absent for automation-sourced entries
        created_by_name: v.optional(v.string()), // display fallback, e.g. "Automation"
        created_at: v.string(),
    })
        .index("by_task", ["care_task_id"])
        .index("by_org", ["organization_id"]),

    // =======================================================================
    // HOUSEHOLDS — family groups
    //
    // Layers on top of the existing per-member address fields; additive only
    // (members with no household_id behave exactly as before). One shared
    // address for map/display purposes, an optional head of household, and
    // a natural target for "family checked in" suggestions and household-wide
    // care follow-up.
    // =======================================================================
    households: defineTable({
        organization_id: v.id("organizations"),
        name: v.string(),
        head_of_household_id: v.optional(v.id("members")), // must be a member of this household
        address: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        zip: v.optional(v.string()),
        country: v.optional(v.string()),
        latitude: v.optional(v.number()),
        longitude: v.optional(v.number()),
        plus_code: v.optional(v.string()),
        created_at: v.string(),
        updated_at: v.string(),
    })
        .index("by_org", ["organization_id"])
        .index("by_head", ["head_of_household_id"]),
});
