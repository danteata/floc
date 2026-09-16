import { describe, expect, it } from "vitest";
import {
    FLAGS,
    FLAG_KEYS,
    type FlagKind,
    isKillSwitch,
    isOrgOverridable,
    overdueFlags,
    unconfiguredValue,
} from "./catalog";
import { flagValue, flagsLoaded, resolveAll, resolveFlag, splitOverrides, toValueMap } from "./resolve";

const ORG_A = "org_a";
const ORG_B = "org_b";

describe("catalogue hygiene", () => {
    /**
     * The flag-debt guard. A flag past its removal date fails the build while it
     * is still declared — the only mechanism that reliably gets flags deleted.
     * When this fails, remove the flag and its branches; don't push the date out.
     */
    it("has no flags past their removal date", () => {
        const overdue = overdueFlags(new Date());
        expect(
            overdue,
            "Overdue flags — remove the flag and its branches rather than extending the date:\n" +
                overdue
                    .map((k) => `  ${k} (owner: ${FLAGS[k].owner}, due ${FLAGS[k].expiresAt})`)
                    .join("\n"),
        ).toEqual([]);
    });

    it("gives every flag an owner", () => {
        for (const key of FLAG_KEYS) {
            expect(FLAGS[key].owner, `${key} has no owner`).toBeTruthy();
        }
    });

    it("requires an expiry on release and experiment flags", () => {
        // Operational flags are configuration, not temporary branches, so they
        // legitimately live forever. A Set rather than `===`, so the rule reads
        // the same whichever kinds the catalogue currently happens to use.
        const needsExpiry = new Set<FlagKind>(["release", "experiment"]);
        for (const key of FLAG_KEYS) {
            const def = FLAGS[key];
            if (needsExpiry.has(def.kind)) {
                expect(def.expiresAt, `${key} is a ${def.kind} flag and needs an expiry`).not.toBeNull();
            }
        }
    });

    it("names kill switches consistently", () => {
        for (const key of FLAG_KEYS) {
            expect(isKillSwitch(key), key).toBe(key.startsWith("kill."));
        }
    });

    /**
     * A kill switch is a deployment-wide control. An org-overridable one would
     * mean "SMS is off for everyone except this church", which is not a state
     * worth being able to reach — and it would hand a tenant admin a lever over
     * a table every tenant shares.
     */
    it("never makes a kill switch org-overridable", () => {
        for (const key of FLAG_KEYS) {
            if (isKillSwitch(key)) {
                expect(isOrgOverridable(key), `${key} is a kill switch`).toBe(false);
            }
        }
    });
});

describe("unconfigured values", () => {
    /**
     * Regression guard for the bug CodeOS shipped: resolving an unconfigured
     * kill switch to OFF meant a fresh deployment came up with the feature
     * already disabled. "Never configured" means normal state.
     */
    it("resolves an unconfigured kill switch to ON, its normal state", () => {
        expect(unconfiguredValue("kill.automations")).toBe(true);
        expect(unconfiguredValue("kill.sms_dispatch")).toBe(true);
    });

    it("keeps every kill switch on for a deployment with no rows", () => {
        const values = toValueMap(resolveAll({}));
        for (const key of FLAG_KEYS) {
            if (isKillSwitch(key)) expect(values[key], key).toBe(true);
        }
    });

    it("resolves an unconfigured release flag to its declared default", () => {
        expect(unconfiguredValue("release.org_branding")).toBe(false);
        expect(unconfiguredValue("ops.verbose_audit")).toBe(false);
    });
});

describe("resolution order", () => {
    it("prefers an organization override over a global one", () => {
        const resolved = resolveFlag("release.org_branding", {
            org: { "release.org_branding": true },
            global: { "release.org_branding": false },
        });
        expect(resolved).toEqual({ key: "release.org_branding", value: true, source: "org" });
    });

    it("falls through to the global override when the org has no opinion", () => {
        const resolved = resolveFlag("release.org_branding", {
            org: {},
            global: { "release.org_branding": true },
        });
        expect(resolved).toEqual({ key: "release.org_branding", value: true, source: "global" });
    });

    it("falls through to the declared default when nothing is configured", () => {
        const resolved = resolveFlag("release.org_branding", {});
        expect(resolved).toEqual({ key: "release.org_branding", value: false, source: "default" });
    });

    /**
     * The second line of defence. `convex/flags.ts` refuses to write an
     * org-scoped row for a kill switch, but a row written before a flag became
     * one must not quietly take effect either.
     */
    it("ignores an organization override on a kill switch", () => {
        const resolved = resolveFlag("kill.sms_dispatch", {
            org: { "kill.sms_dispatch": true },
            global: { "kill.sms_dispatch": false },
        });
        expect(resolved).toEqual({ key: "kill.sms_dispatch", value: false, source: "global" });
    });
});

describe("splitOverrides", () => {
    const rows = [
        { key: "kill.sms_dispatch", enabled: false, organization_id: null },
        { key: "release.org_branding", enabled: true, organization_id: ORG_A },
        { key: "release.member_list_share", enabled: false, organization_id: ORG_B },
    ];

    it("only applies rows belonging to the organization being resolved for", () => {
        const input = splitOverrides(rows, ORG_A);
        expect(input.org).toEqual({ "release.org_branding": true });
        expect(input.global).toEqual({ "kill.sms_dispatch": false });
    });

    it("applies only global rows when there is no organization context", () => {
        const input = splitOverrides(rows, null);
        expect(input.org).toEqual({});
        expect(input.global).toEqual({ "kill.sms_dispatch": false });
    });

    /**
     * Deleting a flag from the catalogue should stop it mattering immediately,
     * without a migration to sweep leftover rows first.
     */
    it("ignores rows for keys that are no longer declared", () => {
        const input = splitOverrides([{ key: "release.removed_long_ago", enabled: true }], ORG_A);
        expect(input.org).toEqual({});
        expect(input.global).toEqual({});
    });
});

describe("reading a flag in the browser", () => {
    it("reads the declared default while the query is still loading", () => {
        // A kill switch reads ON, so no banner flickers on a normal page load.
        // The server is the control; an optimistic client gets an honest refusal.
        expect(flagValue(undefined, "kill.sms_dispatch")).toBe(true);
        expect(flagValue(undefined, "release.org_branding")).toBe(false);
        expect(flagsLoaded(undefined)).toBe(false);
    });

    it("reads the resolved value once it has arrived", () => {
        const map = toValueMap(resolveAll({ global: { "release.org_branding": true } }));
        expect(flagValue(map, "release.org_branding")).toBe(true);
        expect(flagsLoaded(map)).toBe(true);
    });
});
