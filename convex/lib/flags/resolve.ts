import {
    FLAG_KEYS,
    type FlagKey,
    flagDefinition,
    isKillSwitch,
    unconfiguredValue,
} from "./catalog";

/**
 * Flag resolution. Pure — no Convex, no I/O — so the order of precedence is
 * testable in isolation and identical on the server and in the browser.
 *
 * Precedence, highest first:
 *
 *   1. **Organization override** — a `feature_flags` row with an
 *      `organization_id`. This is what lets one church get a feature ahead of
 *      everyone else, which is the reason we scoped flags per org at all.
 *   2. **Global override** — a row with no `organization_id`. What a super
 *      admin writes, and what an incident flips.
 *   3. **Declared default** from the catalogue.
 *
 * With one exception: **a kill switch ignores organization overrides.** It is a
 * deployment-wide control, and "SMS is off for everyone except this church" is
 * not a state worth being able to reach. Writes are refused too (see
 * `convex/flags.ts`) — this is the second line, so a row that predates a flag
 * becoming a kill switch can't quietly take effect.
 */
export type FlagSource = "org" | "global" | "default";

export interface ResolvedFlag {
    readonly key: FlagKey;
    readonly value: boolean;
    readonly source: FlagSource;
}

export interface ResolveInput {
    /** Overrides for the org being resolved for. Absent = no opinion. */
    readonly org?: Partial<Record<FlagKey, boolean>>;
    /** Deployment-wide overrides. Absent = no opinion. */
    readonly global?: Partial<Record<FlagKey, boolean>>;
}

export function resolveFlag(key: FlagKey, input: ResolveInput): ResolvedFlag {
    if (!isKillSwitch(key)) {
        const orgValue = input.org?.[key];
        if (orgValue !== undefined) return { key, value: orgValue, source: "org" };
    }

    const globalValue = input.global?.[key];
    if (globalValue !== undefined) return { key, value: globalValue, source: "global" };

    return { key, value: flagDefinition(key).defaultValue, source: "default" };
}

export function resolveAll(input: ResolveInput): Record<FlagKey, ResolvedFlag> {
    const out = {} as Record<FlagKey, ResolvedFlag>;
    for (const key of FLAG_KEYS) out[key] = resolveFlag(key, input);
    return out;
}

/** Flat key→boolean view: the shape a client actually consumes. */
export function toValueMap(resolved: Record<FlagKey, ResolvedFlag>): Record<FlagKey, boolean> {
    const out = {} as Record<FlagKey, boolean>;
    for (const key of FLAG_KEYS) out[key] = resolved[key].value;
    return out;
}

/**
 * Stored rows → the two override maps.
 *
 * Rows for keys no longer in the catalogue are ignored rather than carried:
 * deleting a flag from the catalogue should stop it mattering, without needing
 * a migration to sweep the table first.
 */
export function splitOverrides(
    rows: ReadonlyArray<{ key: string; enabled: boolean; organization_id?: string | null }>,
    organizationId?: string | null,
): ResolveInput {
    const org: Partial<Record<FlagKey, boolean>> = {};
    const globals: Partial<Record<FlagKey, boolean>> = {};

    for (const row of rows) {
        if (!(FLAG_KEYS as string[]).includes(row.key)) continue;
        const key = row.key as FlagKey;
        if (row.organization_id) {
            if (organizationId && row.organization_id === organizationId) org[key] = row.enabled;
        } else {
            globals[key] = row.enabled;
        }
    }

    return { org, global: globals };
}

/**
 * Reading a flag in the browser.
 *
 * While the query is loading, `map` is undefined and every flag reads as its
 * declared default — so a kill switch reads as ON. That is deliberate: the
 * SERVER is the control, so a briefly-enabled button yields an honest refusal,
 * whereas a banner flickering on every page load is just misinformation. Use
 * `flagsLoaded()` where the UI genuinely needs to tell the two apart.
 */
export function flagValue(
    map: Partial<Record<FlagKey, boolean>> | undefined,
    key: FlagKey,
): boolean {
    const value = map?.[key];
    return value === undefined ? unconfiguredValue(key) : value;
}

/** True once flag state has actually arrived, as opposed to been assumed. */
export function flagsLoaded(map: Partial<Record<FlagKey, boolean>> | undefined): boolean {
    return map !== undefined;
}
