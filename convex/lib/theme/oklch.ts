/**
 * sRGB ↔ OKLCH, so a brand colour can be made lighter or darker without
 * becoming a different colour.
 *
 * Ported from CodeOS (`packages/design-tokens/src/oklch.ts`).
 *
 * The obvious way to lighten a hex is to mix it with white, and it is why
 * generated palettes look wrong: mixing a saturated blue with white walks it
 * toward grey-lavender, and mixing a yellow with black walks it toward olive.
 * HSL is not much better — its "lightness" is a channel average, so
 * `hsl(60 100% 50%)` (yellow) and `hsl(240 100% 50%)` (blue) claim the same
 * lightness while one is nearly white and the other nearly black to the eye.
 *
 * OKLab is a perceptual space built for exactly this: its L really is how light
 * the colour looks, so holding hue and chroma while moving L keeps the brand
 * recognisable. That property is what makes "your brand, guaranteed readable"
 * possible rather than "your brand, approximately".
 *
 * Written out rather than taken from a library: sixty lines of arithmetic with
 * no dependencies, imported by both `convex/` and the browser.
 *
 * Reference: Björn Ottosson, "A perceptual color space for image processing".
 */

export interface Oklch {
    /** Perceived lightness, 0 (black) to 1 (white). */
    l: number;
    /** Chroma — distance from grey. Roughly 0 to 0.37 for sRGB. */
    c: number;
    /** Hue angle in degrees. */
    h: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function parseHex(hex: string): [number, number, number] {
    const value = hex.replace("#", "").trim();
    const full =
        value.length === 3
            ? value
                  .split("")
                  .map((c) => c + c)
                  .join("")
            : value.slice(0, 6);
    if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${hex}`);
    return [
        parseInt(full.slice(0, 2), 16) / 255,
        parseInt(full.slice(2, 4), 16) / 255,
        parseInt(full.slice(4, 6), 16) / 255,
    ];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToOklch(hex: string): Oklch {
    const [sr, sg, sb] = parseHex(hex);
    const r = toLinear(sr);
    const g = toLinear(sg);
    const b = toLinear(sb);

    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

    const c = Math.sqrt(a * a + bb * bb);
    // Hue of a grey is meaningless; 0 keeps it deterministic rather than NaN.
    const h = c < 1e-7 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
    return { l: L, c, h };
}

/** The raw conversion, which may land outside sRGB. `oklchToHex` is what callers want. */
function oklchToRgb({ l: L, c, h }: Oklch): [number, number, number] {
    const hr = (h * Math.PI) / 180;
    const a = c * Math.cos(hr);
    const b = c * Math.sin(hr);

    const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

    return [
        4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
        -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
        -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
    ];
}

const inGamut = ([r, g, b]: [number, number, number]) =>
    r >= -1e-4 && r <= 1.0001 && g >= -1e-4 && g <= 1.0001 && b >= -1e-4 && b <= 1.0001;

/**
 * Back to a hex, reducing chroma until the colour actually exists in sRGB.
 *
 * A light, very saturated colour has no sRGB representation — asking for one
 * and clipping the channels shifts the HUE, which is the one property a brand
 * colour cannot lose. Walking chroma down instead desaturates toward the same
 * hue at the same lightness, which reads as "a paler version of our blue"
 * rather than "a different colour".
 */
export function oklchToHex(colour: Oklch): string {
    const l = clamp01(colour.l);
    let lo = 0;
    let hi = Math.max(0, colour.c);

    if (!inGamut(oklchToRgb({ ...colour, l, c: hi }))) {
        // 24 halvings resolves chroma far below the 1/255 a channel can express.
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (inGamut(oklchToRgb({ ...colour, l, c: mid }))) lo = mid;
            else hi = mid;
        }
    } else {
        lo = hi;
    }

    const rgb = oklchToRgb({ ...colour, l, c: lo });
    const hex = rgb
        .map((v) => {
            const n = Math.round(clamp01(fromLinear(v)) * 255);
            return n.toString(16).padStart(2, "0");
        })
        .join("");
    return `#${hex}`;
}

/** Same colour, different perceived lightness. */
export function withLightness(hex: string, l: number): string {
    return oklchToHex({ ...hexToOklch(hex), l: clamp01(l) });
}
