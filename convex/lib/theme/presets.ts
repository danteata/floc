/**
 * A starting point for an organization that has a brand but not a hex to hand.
 *
 * These are a shortcut into the same field an admin can type into, not the only
 * option — which is the difference between this and every church-software
 * theming picker that ships twelve colours and tells the thirteenth church to
 * pick the closest. Each is a single hue: the light and dark palettes, the
 * quiet grounds and the chart ramp are all derived from it by `deriveBrand`
 * and contrast-checked per mode, so a preset can't be a hand-tuned pair that
 * behaves differently from a colour somebody enters.
 */
export interface BrandPreset {
    id: string;
    name: string;
    hex: string;
}

/**
 * The colour a deployment falls back to.
 *
 * Our shipped `--primary`, `oklch(0.514 0.222 16.935)`, as hex — so an
 * organization that has never set a theme and one that deliberately chose the
 * default render identically. `brand.test.ts` holds the two together; if
 * `index.css` moves, that test fails rather than the default quietly becoming
 * a colour nobody chose.
 *
 * Note that value is outside the sRGB gamut, so this is its chroma-reduced
 * form — the same mapping `oklchToHex` applies, not a channel clip, which
 * would have shifted the hue.
 */
export const DEFAULT_BRAND_HEX = "#c1003a";

export const BRAND_PRESETS: readonly BrandPreset[] = [
    { id: "default", name: "Rose (default)", hex: DEFAULT_BRAND_HEX },
    { id: "plum", name: "Plum", hex: "#5b21b6" },
    { id: "indigo", name: "Indigo", hex: "#4338ca" },
    { id: "ocean", name: "Ocean", hex: "#0369a1" },
    { id: "teal", name: "Teal", hex: "#0f766e" },
    { id: "forest", name: "Forest", hex: "#15803d" },
    { id: "olive", name: "Olive", hex: "#4d7c0f" },
    { id: "amber", name: "Amber", hex: "#b45309" },
    { id: "clay", name: "Clay", hex: "#9a3412" },
    { id: "crimson", name: "Crimson", hex: "#9f1239" },
    { id: "graphite", name: "Graphite", hex: "#44403c" },
    { id: "midnight", name: "Midnight", hex: "#1e3a5f" },
] as const;

export function brandPreset(id: string): BrandPreset | undefined {
    return BRAND_PRESETS.find((p) => p.id === id);
}
