import { AA_LARGE, AA_TEXT, contrastRatio } from "./contrast";
import { hexToOklch, oklchToHex, withLightness } from "./oklch";

/**
 * An organization's colour, turned into a palette that cannot be illegible.
 *
 * Adapted from CodeOS (`packages/design-tokens/src/brand.ts`).
 *
 * ## The problem with letting a customer pick a colour
 *
 * Twelve fixed presets are safe because nobody can enter a colour — and that is
 * also the limitation, because the first church whose brand is not one of the
 * twelve gets somebody else's blue. Accepting any colour means accepting
 * `#FFE800`: fine as a button fill with black text, and 1.2:1 as link text on
 * white, which is invisible. A theming feature that renders a customer's
 * product unusable is worse than no theming feature, and "we warned them" is
 * not a defence when the person who cannot read the screen is a volunteer
 * marking attendance on their phone.
 *
 * ## So the brand colour is a hue, not a value
 *
 * What an organization recognises as "their colour" is its hue and roughly its
 * chroma. Lightness is the part that has to move, and OKLCH is the space where
 * moving it doesn't change the other two. Each token below takes the brand's
 * hue and chroma and finds the lightness that clears WCAG AA against the
 * surface it will actually sit on — separately for light and dark, because the
 * same colour cannot clear both against opposite grounds.
 *
 * The adjustments are reported rather than hidden. An admin who picks a pale
 * yellow should see that their link colour was darkened, and by how much,
 * instead of wondering why the preview doesn't match the swatch.
 *
 * ## What was dropped from the original
 *
 * CodeOS derives three more tokens for a deep navigation bar with white text on
 * it, held to a floor measured from their own shipped gradient. Our sidebar is
 * a light surface with dark text (`--sidebar` / `--sidebar-foreground`), so
 * those tokens would have no home here and their floors would be someone else's
 * measurements. Hover and active fills went the same way: our components reach
 * for `hover:bg-primary/90` rather than a token.
 */

/**
 * Our surfaces, as hex, matching `src/index.css`.
 *
 * Written as the OKLCH triples that file actually contains, converted here, so
 * the relationship is visible rather than a hex somebody would have to trust.
 * If the palette in `index.css` moves, these move with it — and `brand.test.ts`
 * checks derived tokens against these, so a drift shows up as a failing
 * contrast assertion rather than as a washed-out button in production.
 */
export const LIGHT_SURFACE = oklchToHex({ l: 1, c: 0, h: 0 }); // --background
export const LIGHT_TEXT = oklchToHex({ l: 0.147, c: 0.004, h: 49.3 }); // --foreground
export const DARK_SURFACE = oklchToHex({ l: 0.147, c: 0.004, h: 49.3 }); // .dark --background
export const DARK_TEXT = oklchToHex({ l: 0.986, c: 0.002, h: 67.8 }); // .dark --foreground

export interface BrandTokens {
    /** Fill for a primary button. → `--primary`, `--sidebar-primary`, `--ring`. */
    accent: string;
    /** A tinted ground: a selected nav item, a hover row. → `--accent`, `--sidebar-accent`. */
    accentQuiet: string;
    /** The accent as a GLYPH, which needs more contrast than the same colour as a fill. */
    accentText: string;
    /** What sits on top of `accent` — a primary button's label. */
    accentContrast: string;
}

export interface BrandAdjustment {
    token: keyof BrandTokens;
    mode: "light" | "dark";
    /** What the brand colour would have been, unadjusted. */
    from: string;
    to: string;
    /** The ratio it would have had, and the one it has. */
    fromRatio: number;
    toRatio: number;
}

export interface DerivedBrand {
    light: BrandTokens;
    dark: BrandTokens;
    /** Every place the colour had to move to stay legible. Empty for a well-chosen one. */
    adjustments: BrandAdjustment[];
}

/**
 * The lightness at which `hex` clears `target` against `ground`, searching in
 * the given direction.
 *
 * A binary search rather than a fixed step: the relationship between OKLCH
 * lightness and WCAG contrast is monotonic but not linear, so stepping by a
 * constant either overshoots into a washed-out colour or stops one step short
 * of legible.
 */
function lightnessForContrast(
    hex: string,
    ground: string,
    target: number,
    direction: "lighter" | "darker",
): string {
    const { l } = hexToOklch(hex);
    let lo = direction === "lighter" ? l : 0;
    let hi = direction === "lighter" ? 1 : l;

    // If even the extreme fails, return it: white on white cannot be fixed by
    // this function, and pretending otherwise would hide the real problem,
    // which is the GROUND.
    const extreme = withLightness(hex, direction === "lighter" ? 1 : 0);
    if (contrastRatio(extreme, ground) < target) return extreme;

    for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if (contrastRatio(withLightness(hex, mid), ground) >= target) {
            // Keep the least extreme lightness that still passes, so the colour
            // stays as close to the brand as the requirement allows.
            if (direction === "lighter") hi = mid;
            else lo = mid;
        } else if (direction === "lighter") lo = mid;
        else hi = mid;
    }
    return withLightness(hex, direction === "lighter" ? hi : lo);
}

/** Black or white — whichever of our two text colours is more readable on `background`. */
export function readableOn(background: string): string {
    return contrastRatio(DARK_TEXT, background) >= contrastRatio(LIGHT_TEXT, background)
        ? DARK_TEXT
        : LIGHT_TEXT;
}

function ensure(
    hex: string,
    ground: string,
    target: number,
    direction: "lighter" | "darker",
    token: keyof BrandTokens,
    mode: "light" | "dark",
    adjustments: BrandAdjustment[],
): string {
    const ratio = contrastRatio(hex, ground);
    if (ratio >= target) return hex;
    const fixed = lightnessForContrast(hex, ground, target, direction);
    adjustments.push({
        token,
        mode,
        from: hex,
        to: fixed,
        fromRatio: Math.round(ratio * 100) / 100,
        toRatio: Math.round(contrastRatio(fixed, ground) * 100) / 100,
    });
    return fixed;
}

/**
 * How much chroma a tint keeps, as a function of how far it was pulled toward
 * the surface.
 *
 * A tint that holds its saturation while its lightness runs to the paper looks
 * like a boiled sweet rather than a quiet version of a colour. Chroma has to
 * fall with lightness; CodeOS found that letting the two drift apart turned
 * every selected nav item and info badge into a saturated cyan.
 */
const CHROMA_FALLOFF = 1.93;

/**
 * A tint of the brand for a quiet ground.
 *
 * Derived by pulling the brand's lightness most of the way to the surface's
 * while keeping a trace of its chroma, rather than by alpha-blending: a
 * translucent accent over an unknown background composites differently on a
 * card than on the page, and these grounds appear on both.
 */
function quiet(hex: string, surfaceL: number, pull: number): string {
    const { l, c, h } = hexToOklch(hex);
    return oklchToHex({
        l: l + (surfaceL - l) * pull,
        c: c * (1 - pull) * CHROMA_FALLOFF,
        h,
    });
}

/**
 * `contrastFloor` exists for tests and for a possible future "AAA" toggle. It
 * is deliberately not exposed in the console: an admin choosing their own
 * accessibility threshold is a decision with no good answer, and AA is the one
 * the rest of the product is held to.
 */
export function deriveBrand(brandHex: string, contrastFloor = AA_TEXT): DerivedBrand {
    const adjustments: BrandAdjustment[] = [];
    const brand = oklchToHex(hexToOklch(brandHex)); // normalise casing and shorthand
    const lightSurfaceL = hexToOklch(LIGHT_SURFACE).l;
    const darkSurfaceL = hexToOklch(DARK_SURFACE).l;

    const build = (mode: "light" | "dark"): BrandTokens => {
        const surface = mode === "light" ? LIGHT_SURFACE : DARK_SURFACE;
        const surfaceL = mode === "light" ? lightSurfaceL : darkSurfaceL;
        // Light mode darkens toward legibility, dark mode lightens. The other
        // way works arithmetically and produces a button nobody would call
        // their brand colour.
        const direction = mode === "light" ? "darker" : "lighter";

        /**
         * The FILL is held to 3:1, not 4.5:1.
         *
         * A button is a large block of colour, not a glyph, and WCAG's non-text
         * requirement for a control is 3:1. Forcing a fill to 4.5:1 against the
         * page would rule out most mid-tone brand colours for no accessibility
         * gain — what matters on a button is the label against the fill, which
         * `accentContrast` guarantees separately.
         */
        const accent = ensure(brand, surface, AA_LARGE, direction, "accent", mode, adjustments);
        const accentQuiet = quiet(accent, surfaceL, mode === "light" ? 0.908 : 0.82);

        /*
         * The same colour as TEXT has to clear the body-text threshold against
         * `surface` — where a link or heading sits — AND against `accentQuiet`,
         * where a badge or a selected row sits. Two different grounds, and
         * passing one is not evidence of passing the other: CodeOS found a
         * brand blue clearing the page at 4.52:1 and its own badge ground at
         * 4.03:1. Chaining the second `ensure` only ever pushes further in the
         * same direction, so it cannot undo the first guarantee.
         */
        const accentText = ensure(
            ensure(brand, surface, contrastFloor, direction, "accentText", mode, adjustments),
            accentQuiet,
            contrastFloor,
            direction,
            "accentText",
            mode,
            adjustments,
        );

        return {
            accent,
            accentQuiet,
            accentText,
            accentContrast: readableOn(accent),
        };
    };

    return { light: build("light"), dark: build("dark"), adjustments };
}

/**
 * A hex the theming surface will accept.
 *
 * Deliberately strict: three- and six-digit hex only. An `rgb()` string, a
 * colour name or an eight-digit hex with alpha would each need a different
 * answer to "what is this colour on an unknown ground", and a brand colour is a
 * value an admin can paste from a brand guide.
 */
export function isBrandHex(value: string): boolean {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}
