# Floc demo: design spec

## Palette
- `cream` #FAF7F1: ground for every product frame.
- `cream-deep` #F3EEE4: depth panel behind screen windows.
- `ink` #1C1917: statements on cream; ground for the hook (Frame 1).
- `ink-soft` #57534E: sub-lines on cream.
- `ink-mute` #716A65: docket labels (darkened for contrast).
- `crimson` #C1153F: the one accent. Docket numbers, callout leaders, one underline per frame at most, the mark tile.
- `crimson-soft` #F6DDE3: callout tag fill tint (optional).
- `hairline` #E7E0D4: window borders, tag borders.
- On ink ground: statements #FAF7F1, sub-lines #A8A29E, accents #E8567A (crimson lifted for dark).

## Type
- Display: Fraunces 500 (400 for long lines), sentence case, letter-spacing -0.02em, line-height 1.05. Statements 64-72px; the hook and brand up to 96px.
- Text: Inter (variable), 400/500. Sub-lines 26-30px. Callout tags 17px Inter 600, sentence case (not uppercase).
- Docket label: Inter 600, 16px, letter-spacing 0.14em, uppercase: crimson number, a 40px crimson hairline, ink-mute label. Example: `01 ── Sunday`.

```css
@font-face{font-family:"Fraunces";font-weight:400;font-style:normal;font-display:block;src:url("assets/fonts/fraunces-latin-400-normal.woff2") format("woff2");}
@font-face{font-family:"Fraunces";font-weight:500;font-style:normal;font-display:block;src:url("assets/fonts/fraunces-latin-500-normal.woff2") format("woff2");}
@font-face{font-family:"Inter";font-weight:100 900;font-style:normal;font-display:block;src:url("assets/fonts/inter-latin-wght-normal.woff2") format("woff2");}
```

## Components
- `screen-window`: the capture in a rounded window, 16px radius, 1px hairline border, soft warm shadow `0 40px 100px -40px rgba(28,25,23,0.40)`, a `cream-deep` panel offset 40px behind it for depth. Captures are never recoloured; crop only.
- `phone-window`: 390-wide phone at 1170x2532 source, 48px radius, 10px ink bezel, same shadow.
- `callout`: a 2px crimson leader from the measured point to a tag: cream fill, 1px hairline, 6px radius, ink text, soft shadow. Pin it inside the camera wrapper so it moves with the push.
- `mark`: the Floc tile, crimson rounded square (radius 22% of size) with the lucide church icon in cream, stroke 2, round caps/joins, viewBox 0 0 24 24:
  `M10 9h4` · `M12 7v5` · `M14 21v-3a2 2 0 0 0-4 0v3` · `m18 9 3.52 2.147a1 1 0 0 1 .48.854V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6.999a1 1 0 0 1 .48-.854L6 9` · `M6 21V7a1 1 0 0 1 .376-.782l5-3.999a1 1 0 0 1 1.249.001l5 4A1 1 0 0 1 18 7v14`
  Wordmark "Floc" in Fraunces 600-ish (use 500) beside it.

## Layout
- 1920x1080, 96px outer margins, nothing important in the bottom 17%.
- Product frames: docket + statement in the left column (x 96, width ~460), screen window on the right (x ~600, 1224x765 = source x 0.425). Vary where a frame needs it (phones, montage).

## Motion
- GSAP, long-tail `power3.out` settles, no bounce or overshoot.
- Each piece enters on its own beat, spread across the frame; nothing all at t=0.
- Camera pushes on an inner wrapper to the region the statement names, settle fully, hold still. No drift in the back half of a frame.
