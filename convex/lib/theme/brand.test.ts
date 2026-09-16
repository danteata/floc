import { describe, expect, it } from "vitest";
import {
    AA_LARGE,
    AA_TEXT,
    contrastRatio,
    relativeLuminance,
} from "./contrast";
import {
    DARK_SURFACE,
    LIGHT_SURFACE,
    deriveBrand,
    isBrandHex,
    readableOn,
} from "./brand";
import { hexToOklch, oklchToHex, withLightness } from "./oklch";
import { BRAND_PRESETS, DEFAULT_BRAND_HEX, brandPreset } from "./presets";
import { SEQUENTIAL_L_DARK, SEQUENTIAL_L_LIGHT, sequentialRamp } from "./chart";
import { brandVariables } from "./css";

/**
 * The colours a real church would actually paste in, including the ones that
 * break naive theming: a near-white yellow, a near-black navy, a pure grey with
 * no hue at all, and a saturated cyan that doesn't exist at high lightness in
 * sRGB.
 */
const AWKWARD = [
    "#ffe800", // the classic: fine as a fill, invisible as text on white
    "#ffffff",
    "#000000",
    "#808080", // no hue — the chroma-is-zero path
    "#00ffff",
    "#0a0f2c", // nearly black navy: nothing to darken toward in light mode
    "#fef3c7", // pale cream
    DEFAULT_BRAND_HEX,
    ...BRAND_PRESETS.map((p) => p.hex),
];

describe("oklch round trip", () => {
    it("returns a colour to itself", () => {
        for (const hex of AWKWARD) {
            expect(oklchToHex(hexToOklch(hex)), hex).toBe(hex.toLowerCase());
        }
    });

    it("holds hue while moving lightness", () => {
        // The property the whole feature rests on: lighten our brand and it is
        // still recognisably our brand, not a grey-lavender.
        const { h } = hexToOklch("#0369a1");
        for (const l of [0.2, 0.4, 0.6, 0.8]) {
            const moved = hexToOklch(withLightness("#0369a1", l));
            expect(Math.abs(moved.h - h), `lightness ${l}`).toBeLessThan(1.5);
            expect(moved.l).toBeCloseTo(l, 2);
        }
    });

    it("desaturates rather than shifting hue when a colour leaves sRGB", () => {
        // A very light, very saturated colour has no sRGB representation.
        // Clipping channels would move the hue; walking chroma down keeps it.
        const wanted = { l: 0.95, c: 0.3, h: 250 };
        const got = hexToOklch(oklchToHex(wanted));
        expect(Math.abs(got.h - 250)).toBeLessThan(2);
        expect(got.c).toBeLessThan(0.3);
    });

    it("gives a grey a deterministic hue rather than NaN", () => {
        expect(hexToOklch("#808080").h).toBe(0);
        expect(Number.isNaN(hexToOklch("#808080").c)).toBe(false);
    });
});

describe("contrast", () => {
    it("matches the WCAG reference points", () => {
        expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
        expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
        expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    });

    it("refuses a colour it cannot read rather than guessing", () => {
        // Alpha is a different question; answering it silently would be worse.
        expect(() => relativeLuminance("#ffffff80")).not.toThrow(); // 8-digit: alpha sliced off
        expect(() => relativeLuminance("rgb(0,0,0)")).toThrow();
        expect(() => relativeLuminance("rebeccapurple")).toThrow();
    });
});

/**
 * The reason this feature is safe to offer at all: whatever a tenant enters,
 * every derived token clears the bar against the surface it sits on, in BOTH
 * themes. If any of these fail, the theming picker is shipping unusable
 * screens to somebody's volunteers.
 */
describe("derived palettes are legible for any colour", () => {
    for (const hex of AWKWARD) {
        it(`keeps ${hex} legible in both modes`, () => {
            const derived = deriveBrand(hex);

            for (const [mode, surface] of [
                ["light", LIGHT_SURFACE],
                ["dark", DARK_SURFACE],
            ] as const) {
                const t = derived[mode];

                // A fill is a large block of colour: WCAG's non-text bar.
                expect(
                    contrastRatio(t.accent, surface),
                    `${hex} ${mode} accent on surface`,
                ).toBeGreaterThanOrEqual(AA_LARGE - 0.01);

                // A label on that fill is body text.
                expect(
                    contrastRatio(t.accentContrast, t.accent),
                    `${hex} ${mode} label on accent`,
                ).toBeGreaterThanOrEqual(AA_TEXT - 0.01);

                // The accent AS TEXT, against both grounds it appears on.
                expect(
                    contrastRatio(t.accentText, surface),
                    `${hex} ${mode} accentText on surface`,
                ).toBeGreaterThanOrEqual(AA_TEXT - 0.01);
                expect(
                    contrastRatio(t.accentText, t.accentQuiet),
                    `${hex} ${mode} accentText on its own quiet ground`,
                ).toBeGreaterThanOrEqual(AA_TEXT - 0.01);
            }
        });
    }

    it("reports what it had to move, instead of silently fixing it", () => {
        // #ffe800 as link text on white is about 1.2:1. The admin should see
        // that it was darkened, and by how much.
        const derived = deriveBrand("#ffe800");
        const textAdjustments = derived.adjustments.filter((a) => a.token === "accentText");
        expect(textAdjustments.length).toBeGreaterThan(0);
        const light = textAdjustments.find((a) => a.mode === "light")!;
        expect(light.fromRatio).toBeLessThan(AA_TEXT);
        expect(light.toRatio).toBeGreaterThanOrEqual(AA_TEXT);
        expect(light.from).not.toBe(light.to);
    });

    it("leaves a well-chosen colour alone", () => {
        // Nothing to report means nothing was moved — the swatch the admin
        // picked is the colour they get.
        const derived = deriveBrand("#0369a1");
        const lightAccent = derived.adjustments.filter(
            (a) => a.mode === "light" && a.token === "accent",
        );
        expect(lightAccent).toEqual([]);
    });

    it("keeps a tint quiet rather than turning it into a boiled sweet", () => {
        // Chroma must fall with lightness. CodeOS shipped these drifting apart
        // and every selected nav item came out a saturated cyan.
        const derived = deriveBrand("#0369a1");
        const accent = hexToOklch(derived.light.accent);
        const tint = hexToOklch(derived.light.accentQuiet);
        expect(tint.l).toBeGreaterThan(accent.l);
        expect(tint.c).toBeLessThan(accent.c * 0.35);
    });

    it("picks the readable text colour for a fill", () => {
        expect(readableOn("#ffffff")).toBe(readableOn("#fef3c7"));
        expect(contrastRatio(readableOn("#0a0f2c"), "#0a0f2c")).toBeGreaterThan(AA_TEXT);
    });
});

describe("chart ramp", () => {
    for (const mode of ["light", "dark"] as const) {
        it(`steps monotonically and separates from the ${mode} surface`, () => {
            const ramp = sequentialRamp("#0369a1", mode);
            const lightnesses = ramp.map((hex) => hexToOklch(hex).l);
            const steps = mode === "light" ? SEQUENTIAL_L_LIGHT : SEQUENTIAL_L_DARK;

            expect(ramp).toHaveLength(5);
            for (let i = 1; i < lightnesses.length; i++) {
                // Adjacent steps must be far enough apart to read as different.
                expect(Math.abs(lightnesses[i] - lightnesses[i - 1])).toBeGreaterThanOrEqual(0.06);
                // And they must run in one direction, not wander.
                expect(Math.sign(lightnesses[i] - lightnesses[i - 1])).toBe(
                    Math.sign(steps[i] - steps[i - 1]),
                );
            }

            const surface = mode === "light" ? LIGHT_SURFACE : DARK_SURFACE;
            const dimmest = mode === "light" ? ramp[0] : ramp[0];
            expect(contrastRatio(dimmest, surface)).toBeGreaterThanOrEqual(2);
        });
    }

    it("holds one hue across the whole ramp", () => {
        const hues = sequentialRamp("#0369a1", "light").map((hex) => hexToOklch(hex).h);
        for (const h of hues) expect(Math.abs(h - hues[0])).toBeLessThan(2);
    });
});

describe("accepted input", () => {
    it("takes three- and six-digit hex only", () => {
        expect(isBrandHex("#abc")).toBe(true);
        expect(isBrandHex("#0369a1")).toBe(true);
        expect(isBrandHex("#0369A1")).toBe(true);
        expect(isBrandHex("0369a1")).toBe(false);
        expect(isBrandHex("rgb(3, 105, 161)")).toBe(false);
        expect(isBrandHex("#0369a1ff")).toBe(false);
        expect(isBrandHex("teal")).toBe(false);
    });

    it("resolves every preset", () => {
        for (const preset of BRAND_PRESETS) {
            expect(isBrandHex(preset.hex), preset.id).toBe(true);
            expect(brandPreset(preset.id)).toEqual(preset);
        }
        expect(brandPreset("not-a-preset")).toBeUndefined();
    });

    it("defaults to our shipped --primary, so choosing it changes nothing", () => {
        // If this fails, `index.css` moved and the "default" preset now paints
        // a colour subtly different from an unthemed install.
        expect(DEFAULT_BRAND_HEX).toBe(oklchToHex({ l: 0.514, c: 0.222, h: 16.935 }));
    });
});

describe("css variables", () => {
    it("emits every token the stylesheet declares, for both modes", () => {
        for (const mode of ["light", "dark"] as const) {
            const vars = brandVariables("#0369a1", mode);
            for (const name of [
                "--primary",
                "--primary-foreground",
                "--ring",
                "--accent",
                "--accent-foreground",
                "--sidebar-primary",
                "--sidebar-primary-foreground",
                "--sidebar-accent",
                "--sidebar-accent-foreground",
                "--sidebar-ring",
                "--chart-1",
                "--chart-5",
            ]) {
                expect(vars[name], `${mode} ${name}`).toMatch(/^#[0-9a-f]{6}$/);
            }
        }
    });

    it("differs between modes — the bug a single resolved palette would ship", () => {
        const light = brandVariables("#0369a1", "light");
        const dark = brandVariables("#0369a1", "dark");
        expect(light["--accent"]).not.toBe(dark["--accent"]);
    });
});
