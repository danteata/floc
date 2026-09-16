/**
 * WCAG contrast, so legibility is a checked property rather than a remembered
 * one. Ported from CodeOS (`packages/design-tokens/src/contrast.ts`).
 *
 * Nothing computes a ratio while you are looking at a screen, which is why
 * contrast failures survive review: the palette looks fine to whoever chose it.
 * Every derived brand token is checked against the surface it will actually sit
 * on before it is handed to the browser.
 */

/**
 * Relative luminance, per WCAG 2.1.
 *
 * Accepts `#rgb` and `#rrggbb`. Alpha is not accepted rather than ignored: a
 * ratio against a colour that is partly the background is a different question,
 * and answering it silently would be worse than refusing.
 */
export function relativeLuminance(hex: string): number {
    const value = hex.replace("#", "");
    const full =
        value.length === 3
            ? value
                  .split("")
                  .map((c) => c + c)
                  .join("")
            : value.slice(0, 6);
    if (!/^[0-9a-fA-F]{6}$/.test(full)) {
        throw new Error(`not a hex colour: ${hex}`);
    }
    const channel = (pair: string) => {
        const c = parseInt(pair, 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const r = channel(full.slice(0, 2));
    const g = channel(full.slice(2, 4));
    const b = channel(full.slice(4, 6));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG ratio between two colours: 1 for identical, 21 for black on white. */
export function contrastRatio(a: string, b: string): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Body text. Anything a person reads a sentence of has to clear this. */
export const AA_TEXT = 4.5;

/**
 * Large text, and non-text that carries meaning — a border marking a selected
 * option, an icon whose shape is the information. Deliberately NOT a softer
 * allowance for small text.
 */
export const AA_LARGE = 3;

export function meetsAA(foreground: string, background: string, threshold = AA_TEXT): boolean {
    return contrastRatio(foreground, background) >= threshold;
}
