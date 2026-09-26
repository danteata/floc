# UI and copy pass: plan

A professional polish pass over Floc, modelled on the one just finished in
JURIS: a consistent visual system applied to every screen, and copy that is
plain, accurate and free of filler. Nothing here adds features; it makes what
exists look and read like one product.

## Where Floc stands (surveyed 26 Sep 2026)

- **Stack**: Vite + React 19, Tailwind v4 (`@theme` in `src/index.css`), shadcn/Radix
  primitives, Convex, Clerk. 194 `.tsx` files, about 38,000 lines. 9 test files.
- **Identity already chosen**: crimson primary on warm cream, Fraunces for display,
  Inter for text, JetBrains Mono. Recent commits declared the missing tokens
  (success/warning/info, a warm shadow ladder) and grouped the sidebar. The
  landing page was repositioned around retention ("Make sure no one slips away").
- **Landing page**: in reasonable shape visually. Copy needs work (below).
- **Sign-in**: Clerk's default card, unthemed, and it says "Sign in to State of the
  Flock" and "Welcome back! Please sign in to continue". The name comes from the
  Clerk application settings, not the code.
- **In-app screens**: not yet reviewed visually (they sit behind Clerk sign-in).
  Phase 0 fixes that.

Measured drift, to size the work:

| Signal | Count |
| --- | --- |
| Em dashes in `src` UI text | 164 (plus user-facing strings among 241 in `convex/`) |
| "successfully" in messages | 25 |
| "Please …" in UI text | 28 |
| Raw Tailwind palette classes (purple/indigo/pink/sky/emerald/amber/blue…) instead of tokens | about 260 |
| Arbitrary text sizes (`text-[13px]` etc.) | about 130 |
| Gradients | 22 |
| Icon libraries in use | lucide (114 files) and hugeicons (17 files) |
| Emoji in UI | 6 |
| Dead footer links on the landing page (`href="#"`) | 7, including Privacy and Terms |

## Principles (carried over from JURIS)

- One visual system: tokens only, no raw palette colours outside the token file;
  one type scale; one icon set; shared primitives for headers, empty states,
  stat cards, tables and forms. Light and dark both finished.
- Copy: sentence case; no em dashes; the ellipsis character; no "successfully",
  "Please" or exclamation marks in system messages; no invented numbers; every
  claim true of the product today; the church's own vocabulary (Floc's
  terminology settings) respected rather than hard-coded.
- Every screen checked by eye, at desktop and phone width, in light and dark,
  before and after. Typecheck, lint and tests green at the end of each phase;
  one commit per phase on a feature branch.

## Phase 0: Setup and visual audit

1. Branch `feat/ui-copy-pass` from `main`; record the `npm run check` baseline.
2. Run Floc on a separate port (3200) so it never clashes with another dev server.
3. Sign in once in a Playwright browser window with a persistent profile (you sign
   in; the session is reused for every capture). Seed a realistic sample church if
   the test organization is thin: members across units, a few services with
   attendance and giving, care tasks, events, a drifting-members list.
4. Capture every route at 1440×900 and 390×844, light and dark, into a contact sheet.
5. Write `docs/UI_AUDIT.md`: per screen, what reads as unfinished (spacing, hierarchy,
   off-token colour, empty and loading states, mobile breakage, dark-mode gaps,
   copy). This drives the order of Phase 3.

Routes: `/dashboard`, `/members`, `/attendance`, `/events`, `/care`, `/financial`,
`/reports`, `/organization`, `/automations`, `/command-center`, `/map`, `/admin`,
`/user-management`, `/labels`, `/audit-trail`, `/settings`, `/billing`, `/profile`,
the member portal (`/portal`, `/portal/attendance`, `/portal/profile`, `/portal/link`,
`/portal/giving`), and the public surfaces (`/`, `/sign-in`, `/sign-up`,
`/invite/:token`, `/accept-invitation`, `/check-in/:token`, `/kiosk/:sessionId`,
`/give/:organizationId`, `/share/absent/:token`, `/share/members/:token`).

## Phase 1: Foundations

- **Tokens**: replace the ~260 raw palette classes with semantic tokens
  (primary, success, warning, info, destructive, chart-1..5, muted). Where a colour
  carries meaning (a status, a chart series), give it a named token.
- **Type scale**: collapse the ~130 arbitrary sizes onto a small scale; Fraunces
  for page titles and display figures only, Inter for everything else, mono for
  codes and IDs.
- **Icons**: standardise on lucide (already 114 files); replace hugeicons in its
  17 files unless an icon has no lucide equivalent.
- **Gradients and effects**: review the 22 gradients and the `glass`/`card-neon`
  utilities; keep what serves the brand, remove decoration.
- **Primitives**: `PageHeader` (title, one-line description, actions), `EmptyState`,
  `StatCard`, a consistent table treatment, form field spacing and labels, dialog
  sizes, toasts. Check the shadcn defaults against the cream palette.
- **Guard tests** (as JURIS has): a unit test that fails on em dashes in UI strings
  and on raw palette classes, so the drift cannot return.

## Phase 2: App shell

Sidebar (already grouped), top bar, organization and role indicator, mobile
navigation, page transitions, focus and keyboard states, the loading skeleton
every route shows while Convex resolves.

## Phase 3: Screens, in order of daily use

1. Dashboard
2. Members: table, profile dialog, edit dialog, bulk upload, merge
3. Attendance: form, trends, absent members
4. Check-in: QR self check-in and the kiosk (public, phone-first)
5. Care tasks and automations (the retention engine the landing page sells)
6. Events and event types
7. Financial: transactions and the per-service summary dialogs
8. Reports
9. Organization: units, org chart, terminology, map
10. Admin: users, leader invitations, labels, audit trail
11. Settings and billing
12. Member portal
13. Command centre

For each: the audit's findings, primitives applied, empty/loading/error states,
phone layout, dark mode, then before/after screenshots.

## Phase 4: Auth and public surfaces

- Theme the Clerk components with the `appearance` API (colours, radius, fonts,
  Floc mark) and override the copy with `localization`, so sign-in reads
  "Sign in to Floc" whatever the dashboard says. Rename the Clerk application to
  Floc as well.
- Invitation, accept-invitation, check-in, kiosk, give and share pages: the public
  face of the product for members and volunteers, so they get the same care.

## Phase 5: Copy

- Mechanical pass with an AST scanner (as in JURIS): em dashes, "successfully",
  "Please", exclamation marks, Title Case buttons and labels, "..." for "…".
- Human pass screen by screen: plain words, no jargon ("ops layer"), no filler
  ("Built with love for churches"), consistent names for the same thing.
- **Vocabulary**: one word per concept (member vs person vs congregant; unit vs
  group vs department), and anywhere the organization's terminology setting
  applies, use it rather than a fixed word.
- **Money**: one cedi format everywhere (the landing hero shows "₵20,770" alone;
  settle on GH₵ or ₵ and use it consistently).
- User-facing strings in `convex/` (errors, notifications, digests) included.

## Phase 6: Landing page

- Verify every claim against the product and billing: "Free plan forever",
  "No credit card needed", "Set up in 5 minutes", "Cancel anytime",
  "Priority support", "Ranked by who you're most likely to win back",
  "sent to 3 volunteers", "94% self-served". Keep what is true, reword or cut
  what is not, and label the illustrative Sunday timeline as a sample.
- Remove the em dashes (the hero alone has four).
- The seven dead footer links: build short Privacy and Terms pages (a church
  holds members' personal data), and remove the rest until they exist.
- Optionally replace the mock cards with real screens of the running app, and
  later a tour video with the same HyperFrames pipeline used for JURIS.

## Verification

Baseline on `main` (26 Sep 2026): typecheck clean, 109 tests passing, and
`eslint .` already failing with 413 errors (369 `no-explicit-any`, 131 unused
variables among them). This pass does not take on that debt, but it must never
add to it: the lint error count may only go down.

Each phase ends with typecheck and tests green, the lint count at or below the baseline, before/after contact sheets reviewed
by eye, and a commit. The last step is a full capture of every route in both themes
and widths.

## Decisions (26 Sep 2026)

1. **Signing in**: a new test account on the dev Clerk instance, created by you in
   the capture browser window (the assistant does not create accounts or sign in
   through an outside identity provider); the session is reused for every capture.
2. **Sample data**: yes, a sample church on the dev deployment.
3. **Identity**: keep crimson, cream and Fraunces, and apply them consistently.
4. **Market**: neutral. Copy for churches anywhere: no country named in the
   positioning; currency shown in the organization's own currency where the product
   supports it, and neutral examples on the landing page.
5. **Legal pages**: build short Privacy and Terms pages.
