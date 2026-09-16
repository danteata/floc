import { withLightness } from "./oklch";
import { DARK_SURFACE, LIGHT_SURFACE } from "./brand";

/**
 * The sequential ramp charts read magnitude from.
 *
 * Ported from CodeOS (`packages/design-tokens/src/chart.ts`).
 *
 * ## Why this is generated rather than written down
 *
 * A palette file with five hexes in it is correct for the default brand and
 * wrong for every organization that sets its own colour. `deriveBrand` already
 * re-derives the accent from whatever hex a church pastes in from their brand
 * guide; a chart ramp pinned to the shipped rose would be the one part of the
 * app that ignored that — and this app is mostly charts.
 *
 * ## Why lightness steps rather than mixing toward the surface
 *
 * `color-mix(in oklab, var(--primary) 40%, var(--background))` is one line of
 * CSS and needs no TypeScript. It is also unpredictable: mixing toward white
 * and mixing toward near-black produce ramps with different lightness spacing
 * AND different chroma, so the same declaration yields a well-spaced ramp in
 * one theme and a muddy one in the other. Stepping lightness directly gives
 * both modes the same spacing by construction, and it is testable.
 *
 * ## Why dark is not the reverse of light
 *
 * Light mode runs light → dark: more is darker, against a white page. Dark mode
 * runs dark → light, because "more" has to mean "further from the ground" and
 * the ground is nearly black. Each list was chosen so its own dimmest step
 * still separates from its own surface, which is a different number in each.
 */

/** Light mode: five steps, light → dark. */
export const SEQUENTIAL_L_LIGHT = [0.75, 0.68, 0.61, 0.53, 0.45] as const;

/** Dark mode: five steps, dark → light. Not the light list reversed. */
export const SEQUENTIAL_L_DARK = [0.46, 0.53, 0.6, 0.67, 0.75] as const;

export const CHART_SURFACE = { light: LIGHT_SURFACE, dark: DARK_SURFACE } as const;

/**
 * Five steps of one hue, ordered from least to most.
 *
 * Callers index it by bucket, so step 0 is always "least" in both modes and
 * neither the component nor the CSS has to know which way the lightness runs.
 */
export function sequentialRamp(seedHex: string, mode: "light" | "dark"): string[] {
    const steps = mode === "light" ? SEQUENTIAL_L_LIGHT : SEQUENTIAL_L_DARK;
    return steps.map((lightness) => withLightness(seedHex, lightness));
}
