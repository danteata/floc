import { type DerivedBrand, deriveBrand } from "./brand";
import { sequentialRamp } from "./chart";

/**
 * The derived palette, as the CSS custom properties `src/index.css` actually
 * declares.
 *
 * ## Why this emits resolved values and not a `--l-*` / `--d-*` pair
 *
 * CodeOS sets per-mode variables because its stylesheet picks the active mode
 * in CSS, through three cascade paths (explicit light, explicit dark, and the
 * OS preference when the reader has expressed none). Writing `--accent`
 * directly there would satisfy whichever path was active at the moment the
 * theme was applied and be wrong the instant the reader toggled the theme or
 * their OS switched at sunset.
 *
 * Ours resolves the mode in JavaScript — `theme-provider.tsx` toggles a `.dark`
 * class — so there is no cascade to inherit and one set of resolved values is
 * correct. The catch is that the same bug is now ours to avoid by other means:
 * whatever applies these MUST re-run when the resolved theme changes. See
 * `src/components/brand-provider.tsx`.
 *
 * ## Which variables, and why these
 *
 * Only tokens whose job is "the brand colour". Neutrals, borders, destructive
 * and muted are the product's, not the tenant's — a church that picks a green
 * has not asked for green error messages.
 */
export function brandCssVariables(
    derived: DerivedBrand,
    mode: "light" | "dark",
): Record<string, string> {
    const t = mode === "light" ? derived.light : derived.dark;
    return {
        "--primary": t.accent,
        "--primary-foreground": t.accentContrast,
        // The focus ring is the accent, not the quiet tint: it has to be
        // findable on a page, which is the one job it has.
        "--ring": t.accent,
        // `--accent` in shadcn's vocabulary is the quiet hover/selected ground,
        // not the brand fill — the naming is a trap worth stating once.
        "--accent": t.accentQuiet,
        "--accent-foreground": t.accentText,
        "--sidebar-primary": t.accent,
        "--sidebar-primary-foreground": t.accentContrast,
        "--sidebar-accent": t.accentQuiet,
        "--sidebar-accent-foreground": t.accentText,
        "--sidebar-ring": t.accent,
    };
}

/** The chart ramp for the active mode, as `--chart-1` … `--chart-5`. */
export function chartCssVariables(seedHex: string, mode: "light" | "dark"): Record<string, string> {
    const out: Record<string, string> = {};
    sequentialRamp(seedHex, mode).forEach((hex, index) => {
        out[`--chart-${index + 1}`] = hex;
    });
    return out;
}

/**
 * Everything a brand sets, for one mode. One entry point so the live preview in
 * settings and the runtime provider cannot diverge — a preview computed
 * differently from the thing it previews is a preview of nothing.
 */
export function brandVariables(brandHex: string, mode: "light" | "dark"): Record<string, string> {
    return {
        ...brandCssVariables(deriveBrand(brandHex), mode),
        ...chartCssVariables(brandHex, mode),
    };
}
