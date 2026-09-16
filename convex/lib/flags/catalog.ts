/**
 * The flag catalogue — the only place a feature flag may be declared.
 *
 * Adapted from CodeOS (`packages/flags`). Referencing an undeclared key is a
 * type error, and `catalog.test.ts` fails CI once a flag is past its expiry
 * while still declared. That is the cure for flag debt: a flag with no owner
 * and no expiry never dies, and we already have one of those —
 * `app_config["automation.enabled"]`, read by `convex/automation/guardrails.ts`
 * with no catalogue, no typing and no audit trail. `kill.automations` below
 * replaces it.
 *
 * Platform-neutral on purpose: no Convex, no React, no DOM. It lives under
 * `convex/` (not `src/`) so the backend can import it without the Convex
 * bundler having to resolve the `@/` alias, and the frontend reaches in the
 * same way it already does for `_generated/api`.
 *
 * ## Flags are not entitlements
 *
 * `convex/entitlements.ts` answers "is this in your plan?" — billing,
 * permanent, customer-visible. A flag answers "is this code path on?" — ops and
 * rollout, temporary, ours. A paid feature mid-rollout is gated by BOTH, and a
 * flag must never be what grants a plan feature.
 */

export type FlagKind = "release" | "operational" | "experiment";

export interface FlagDefinition {
    /** One line: what turning this on does. */
    readonly description: string;
    /** The value when nothing has configured it. See `resolve.ts`. */
    readonly defaultValue: boolean;
    /** Who decides to remove it. A flag without an owner never dies. */
    readonly owner: string;
    readonly kind: FlagKind;
    /**
     * ISO date after which this flag is overdue for removal; CI fails once
     * passed. `null` only for operational flags, which are configuration
     * rather than a temporary branch.
     */
    readonly expiresAt: string | null;
    /**
     * A kill switch: an operational control for use during an incident.
     *
     * Global only — a kill switch is never overridden per organization. The
     * table is shared, so letting an org admin write one would be a
     * cross-tenant control dressed as a settings screen, and "SMS is off for
     * everyone except this church" is not a state worth being able to reach.
     */
    readonly killSwitch: boolean;
    /**
     * May an org admin override this for their own organization?
     *
     * False for anything whose blast radius is the deployment (sending money,
     * sending SMS, talking to a provider). True for feature rollout, which is
     * the whole reason we scoped flags per org in the first place.
     */
    readonly orgOverridable: boolean;
}

export const FLAGS = {
    // --- kill switches --------------------------------------------------------
    // `defaultValue: true` means "the feature is on" — the normal state.
    // Flipping to false is the incident action.
    "kill.automations": {
        description:
            "Run the automation engine (rule evaluation and task dispatch). Disable to stop all " +
            "automated follow-up without editing rules. Replaces app_config['automation.enabled'].",
        defaultValue: true,
        owner: "platform",
        kind: "operational",
        expiresAt: null,
        killSwitch: true,
        orgOverridable: false,
    },
    "kill.sms_dispatch": {
        description:
            "Send SMS through the configured provider. Disable on a provider incident or a runaway " +
            "spend, independently of the rest of the automation engine.",
        defaultValue: true,
        owner: "platform",
        kind: "operational",
        expiresAt: null,
        killSwitch: true,
        orgOverridable: false,
    },
    "kill.giving": {
        description:
            "Accept online giving (the public /give page and Paystack checkout). Disable during a " +
            "payment-provider incident so givers get an honest refusal, not a failed charge.",
        defaultValue: true,
        owner: "platform",
        kind: "operational",
        expiresAt: null,
        killSwitch: true,
        orgOverridable: false,
    },
    "kill.public_shares": {
        description:
            "Serve public share links (member lists, absent lists). Disable to revoke every link at " +
            "once if one is found circulating where it shouldn't be.",
        defaultValue: true,
        owner: "platform",
        kind: "operational",
        expiresAt: null,
        killSwitch: true,
        orgOverridable: false,
    },
    /**
     * Lands before the Copilot does.
     *
     * A kill switch rather than a release flag, matching how the feature is
     * actually gated: a deployment with no AI credential already has no
     * Copilot and needs no switch. This is for the other case — a provider
     * that is configured and misbehaving, or expensive, or drafting something
     * we do not want put in front of a grieving family at 9am on a Monday.
     */
    "kill.ai_copilot": {
        description:
            "Allow AI drafting and triage (Pastoral Care Copilot). Disable on a provider incident. " +
            "Turning it off leaves the deterministic engagement scoring, which is the part that " +
            "decides who needs care.",
        defaultValue: true,
        owner: "platform",
        kind: "operational",
        expiresAt: null,
        killSwitch: true,
        orgOverridable: false,
    },

    // --- releases -------------------------------------------------------------
    "release.org_branding": {
        description:
            "Expose per-organization brand colour (Settings → Branding) and apply it to the app and " +
            "public pages.",
        defaultValue: false,
        owner: "product",
        kind: "release",
        expiresAt: "2027-06-30",
        killSwitch: false,
        orgOverridable: true,
    },
    "release.member_list_share": {
        description:
            "Expose the 'Share list' button on the members directory, which publishes a read-only " +
            "list of names and chosen columns behind a link.",
        defaultValue: true,
        owner: "product",
        kind: "release",
        expiresAt: "2027-06-30",
        killSwitch: false,
        orgOverridable: true,
    },

    // --- operational tuning ---------------------------------------------------
    "ops.verbose_audit": {
        description:
            "Record read operations in the audit log as well as writes. Diagnostic only; noisy.",
        defaultValue: false,
        owner: "platform",
        kind: "operational",
        expiresAt: null,
        killSwitch: false,
        orgOverridable: false,
    },
} as const satisfies Record<string, FlagDefinition>;

export type FlagKey = keyof typeof FLAGS;

export const FLAG_KEYS = Object.keys(FLAGS) as FlagKey[];

export function isFlagKey(key: string): key is FlagKey {
    return Object.prototype.hasOwnProperty.call(FLAGS, key);
}

export function flagDefinition(key: FlagKey): FlagDefinition {
    return FLAGS[key];
}

export function isKillSwitch(key: FlagKey): boolean {
    return FLAGS[key].killSwitch;
}

export function isOrgOverridable(key: FlagKey): boolean {
    return FLAGS[key].orgOverridable;
}

/**
 * The value a flag takes when nothing has configured it — always its declared
 * default, kill switches included.
 *
 * CodeOS shipped the other rule first (unresolved kill switch = off) and a
 * fresh deployment came up with code execution disabled. "Never configured"
 * means the feature is in its normal state; "cannot currently be read" is a
 * different problem, and server-side it does not exist — the table read either
 * succeeds or the whole request fails.
 */
export function unconfiguredValue(key: FlagKey): boolean {
    return FLAGS[key].defaultValue;
}

/** Flags whose removal date has passed, as of `now`. */
export function overdueFlags(now: Date): FlagKey[] {
    return FLAG_KEYS.filter((k) => {
        const expires = FLAGS[k].expiresAt;
        return expires !== null && new Date(expires) < now;
    });
}
