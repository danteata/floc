# Porting from CodeOS (virtual-coding-lab)

An assessment of what in `~/work/virtual-coding-lab` (CodeOS) is worth bringing
into this app, and a sequenced plan for doing it.

Both are React + Convex, which is what makes this worth doing at all: the
backend idioms, the schema style and the reactive-query model are the same, so
most of what follows is a copy-and-adapt rather than a rewrite. CodeOS is a
pnpm monorepo with the reusable parts in `packages/*`; this app is a single Vite
package, so ported code lands in `src/lib/` and `convex/lib/` as plain modules,
not as a workspace package. Don't introduce a monorepo for this.

---

## Verdict at a glance

| From CodeOS | Verdict | Why |
|---|---|---|
| Feature flags (`packages/flags`, `convex/flags/`) | **Port**, org-scoped | Replaces an ad-hoc switch we already have; makes every later rollout safe |
| BYOK AI credentials (`convex/ai/`, `convex/lib/secretBox.ts`, `convex/lib/aiProviders.ts`) | **Port** | The exact missing foundation under `PASTORAL_CARE_COPILOT_PLAN.md` |
| Brand theming (`packages/design-tokens/src/brand.ts`, `oklch.ts`, `contrast.ts`, `chart.ts`, `ui-web/src/brand.tsx`) | **Port** | Our tokens are already OKLCH; tenants already rename their hierarchy |
| AI port/adapter discipline (`packages/ai/src/ports.ts`, `adapters/none.ts`) | **Port the shape** | ~200 lines that prevent the worst AI failure mode |
| Tenancy choke point (`convex/lib/tenancy.ts`, `functions.ts`) | **Inspiration** | Right idea, too large to port wholesale; adopt incrementally |
| Authorisation-matrix test (`convex/tests/authz-matrix.test.ts`) | **Inspiration** | Highest-value test investment for a PII app; needs convex-test first |
| Typed error codes (`convex/lib/errors.ts`) | **Port** (tiny) | Needed by flags anyway; improves every error message |
| Rate limiter (`convex/lib/rateLimit.ts`) | **Maybe, later** | We have SMS caps; a generic limiter would cover exports and share links |
| Notifications catalog + outbox | **Skip** | We already have `convex/notifications.ts` + `automation/dispatch.ts` guardrails |
| Webhooks/outbox, PDF, editor, gateway, LTI, proctoring | **Skip** | No demand here yet |

---

## 1. Feature flags — port, with one deliberate change

### What CodeOS has

A declared **catalogue** (`packages/flags/src/catalog.ts`) is the only place a
flag may exist. Each flag carries a description, default, owner, kind
(`release` / `operational` / `experiment` / `permission`), an expiry date and a
`killSwitch` boolean. Referencing an undeclared key is a type error, and
`catalog.test.ts` **fails CI once a flag is past its expiry while still
referenced** — which is the cure for flag debt.

Resolution (`resolve.ts`) is a pure function: native override → external
provider → declared default, with one exception — **a kill switch never
consults an external provider**, so a vendor outage can't stop us turning
something off. Reads are a plain reactive Convex query, so a flip reaches every
connected client instantly. Server-side, `requireFeature` throws
`FEATURE_DISABLED`, so the flag gates the *capability*, not merely the button.

### Why we want it

We already have a hand-rolled version of exactly this, for one feature:
`convex/automation/guardrails.ts` reads an `app_config` row keyed
`"automation.enabled"`, with "missing row = enabled". That is a kill switch with
no catalogue, no typing (`app_config.value` is `v.any()`), no audit trail and no
UI. The second one we write will be another bespoke row.

### The one change: org-scoped overrides

CodeOS's `featureFlags` table is **global, platform-admin only**, and its
comments are explicit that org-scoping would be a schema change. For us it is
the schema change worth making up front, because we are multi-tenant with real
tenants (churches) who should be able to get a feature ahead of everyone else.

    feature_flags: key, organization_id (optional), enabled, updated_at, updated_by
      .index("by_key", ["key"])
      .index("by_org_key", ["organization_id", "key"])

Resolution order: **org override → global override → catalogue default.**

- `killSwitch: true` flags are **global-only** and writable by super admins
  only. A row with an `organization_id` for a kill-switch key is rejected at
  write time. (CodeOS's reasoning holds: a global control an org admin can
  write is cross-tenant privilege escalation dressed as a settings screen.)
- `release` flags are org-overridable by org admins, global-settable by super
  admins.

### Keep flags and entitlements separate

We already have `convex/entitlements.ts` (Free vs Pro, `requireFeature`,
`ProFeature`). Do not merge the two, and do not let a flag grant a paid
feature. The rule:

- **Entitlements answer "is this in your plan?"** — billing, permanent,
  customer-visible, enforced by `entitlements.requireFeature`.
- **Flags answer "is this code path on?"** — ops and rollout, temporary,
  internal, enforced by `flags.requireFeature`.

A Pro feature being rolled out is gated by **both**. Note the name collision:
port the flags helper as `requireFlag` to avoid shadowing the entitlements one.

### Steps

1. `src/lib/flags/catalog.ts` — port the structure, replace the contents with
   our flags. Starting catalogue:
   - `kill.automations` (migrates `app_config["automation.enabled"]`)
   - `kill.sms_dispatch`, `kill.paystack_webhooks`
   - `kill.ai_copilot` (lands before the Copilot does)
   - `release.org_branding`, `release.member_list_share`
   - `ops.verbose_audit`
2. `src/lib/flags/resolve.ts` + `client.ts` — port nearly verbatim; extend
   `ResolveInput` with the org tier. Skip `adapter.ts` and the PostHog adapter:
   we have no external provider, and the native path is the one we want.
3. Port `catalog.test.ts` — the expiry check is the reason this doesn't rot.
4. `convex/schema.ts` — the table above.
5. `convex/flags.ts` — `resolved` (unauthenticated, org-optional, reactive),
   `catalogue` (admin console view), `set`, `clearOverride`. Audit every write
   with before/after, as CodeOS does; we already have `internal.audit.logEvent`.
6. `convex/lib/flags.ts` — `isFlagEnabled` / `requireFlag`.
7. `src/hooks/use-flags.ts` — wraps the reactive query; `flagValue()` supplies
   the default while loading (their reasoning about optimistic client reads and
   server-side enforcement applies unchanged).
8. Admin panel — a "Feature flags" tab in `settings-dialog.tsx`, or in
   `admin-content.tsx` for the super-admin view. Render from the **catalogue**,
   not from the rows, so a never-overridden flag still appears with its owner.
9. Migrate `guardrails.ts` to `kill.automations`; leave the `app_config` read as
   a fallback for one release, then delete it.

**Effort:** ~1 day. **Risk:** low — nothing depends on it until we gate something.

---

## 2. BYOK AI credentials — port, ahead of the Copilot

### What CodeOS has

`convex/lib/secretBox.ts`: AES-256-GCM, random 96-bit IV per encryption, key in
`AI_CREDENTIAL_KEY`, and it **throws rather than falling back to plaintext** if
the key is missing. The file's own "what this is not" section is honest about
the limit — an attacker with the database *and* the environment has the key;
what it defends against is a snapshot, a support export, a dashboard read.

`convex/ai/credentials.ts` + `internal.ts`: the write is an **action** (sealing
draws randomness, and Convex retries mutations), which hands finished ciphertext
to an internal mutation. The plaintext never comes back out — `set` returns only
the provider and the last four characters. Reading a live key is one internal
query, not client-callable. Authorisation happens in the mutation, not the
action, so the `orgId` the client passes is a hint about which membership to
resolve, never an instruction about where to write.

`convex/lib/aiProviders.ts`: **org key first, then the deployment's, then
nothing** — and an org that has configured a key either uses it or gets nothing,
never a silent fallback to the platform's key, because falling back would send
their data somewhere they didn't agree to.

`packages/ai/src/ports.ts` + `adapters/none.ts`: a narrow port where **failure
is a value, not an exception** — every timeout, 500 or unparseable answer comes
back as `{ marked: false, reason, retryable }`, and the no-provider default
declines honestly rather than guessing.

### Why we want it

`PASTORAL_CARE_COPILOT_PLAN.md` commits to per-org opt-in, PII minimisation,
Pro gating, and an action calling Claude off the hot path. It does not say where
the key lives. This is that layer, already built and already reasoned about —
and for pastoral data (health, grief, finance, per that plan) "the church's own
vendor contract and retention settings" is a materially better answer to a
safeguarding question than ours.

### Adaptations

- **Runtime:** CodeOS marks `credentials.ts` `"use node"`. `crypto.subtle` is
  available in Convex's default runtime, so drop it unless something else in the
  file needs Node — verify before copying (we have no `"use node"` files today,
  and adding one splits the module).
- **Auth:** replace `requireCap(actor, "org:settings")` with our
  `requireOrgAdmin` + `resolveOrgId`; keep the check inside the internal
  mutation, not the action.
- **Gating:** wrap in `entitlements.requireFeature("ai_copilot")` (a new
  `ProFeature`) *and* `kill.ai_copilot`.
- **Provider set:** Anthropic first. Keep the `openai` literal in the union —
  it covers every OpenAI-compatible endpoint and costs nothing to carry.

### Steps

1. `npx convex env set AI_CREDENTIAL_KEY "$(openssl rand -base64 32)"` on dev
   first. Document it in `README.md`; a deployment without it cannot store keys
   and says so loudly.
2. Port `convex/lib/secretBox.ts` verbatim (seal / open / fingerprint).
3. `convex/schema.ts` — `ai_credentials` table, per their shape: org, provider,
   ciphertext, iv, hint, optional base/chat URL and model, status,
   `last_used_at`, `last_error`, created/updated. Index `by_org_provider`.
   Keep `last_used_at` / `last_error`: they are the only answer to "is this key
   still working?", which is the question an admin actually has.
4. `convex/ai/credentials.ts` (action: `set`, `clear`) and
   `convex/ai/internal.ts` (`store`, `remove`, `noteUse`, `credentialFor`).
   `credentialFor` returns a decrypted key and must never become public.
5. Audit `ai.credential.changed` **without the value** — one of the few writes
   whose content must never appear in the log that records it.
6. `convex/lib/aiProviders.ts` — the resolution order above, trimmed to the
   ports we actually need.
7. Port the shape of `ports.ts` (`readVerdict`, `extractJson`, `withTimeout`)
   and `adapters/none.ts` when the first Copilot feature lands. The discipline
   is the point: a draft that fails must fail visibly, not produce a plausible
   message a leader then sends to a grieving family.
8. Settings UI — an "AI" tab: provider, key field (write-only, shows `…a1b2`),
   optional model, and the last-used/last-error line.

**Effort:** ~1.5 days for the vault + settings tab. The Copilot features are
their own plan; this unblocks all of them.

---

## 3. Per-tenant brand theming — port, best effort-to-visibility ratio

### What CodeOS has

An organisation stores **one hex**. `deriveBrand()` turns it into a palette that
*cannot be illegible*: the brand colour is treated as a **hue and chroma**, and
lightness is moved — by binary search in OKLCH — until each token clears WCAG AA
against the surface it will actually sit on, separately for light and dark. The
adjustments are **reported**, so an admin who picks pale yellow sees that their
link colour was darkened and by how much, rather than wondering why the preview
doesn't match the swatch. Chart ramps are derived from the same seed
(`chart.ts`), so the one part of the console that usually ignores tenant
branding doesn't. Twelve presets exist as a shortcut into the same field, not as
the only option.

### Why it fits us unusually well

- Our tokens in `src/index.css` are **already `oklch()`** under Tailwind v4, and
  their `oklch.ts` converts both ways — so the derivation can emit values
  straight into `--primary`, `--ring`, `--chart-1..5`, `--sidebar-primary`.
- We already let tenants rename their entire hierarchy
  (`terminology-management.tsx`, `level1_singular` …). Branding is the visual
  half of a white-label story we have already half-committed to, and our tenants
  are literally different churches.
- Our public pages — `/share/members/:token`, `/share/absent/:token`,
  `/give/:organizationId`, `/check-in/:token` — are the ones outsiders see.
  CodeOS's theme module argues against an unauthenticated theme endpoint
  (it confirms whether an org id is real, then needs its own rate limiter) and
  rides the brand on the query the page is already making. Our share pages
  already resolve the org server-side from the token, so we get branded public
  pages with **no new endpoint**.

### Adaptations

- **Skip the `--l-*` / `--d-*` split.** It exists because their `tokens.css`
  resolves the active mode in CSS, so writing `--accent` directly breaks at
  sunset. Our `theme-provider.tsx` resolves the mode in JS and toggles a `.dark`
  class, so the provider can write resolved values — but it **must re-run on
  `resolvedTheme` change**, and must remove the properties it set on unmount.
  Get this wrong and we ship the exact bug their comment describes.
- Derive `--primary-foreground` from their `accentContrast`, and map
  `accentQuiet` onto our `--accent` / `--sidebar-accent`.
- Their nav-gradient tokens (`navFrom/Via/To`) assume a deep nav with white
  text. Check `layout-wrapper.tsx` / `sidebar.tsx` before porting those three;
  if our sidebar takes its colour from `--sidebar`, adapt rather than copy.

### Steps

1. Port `src/lib/theme/oklch.ts`, `contrast.ts`, `brand.ts`, `chart.ts`,
   `presets.ts` (replace the preset list with ours; default = our current
   `--primary`, so an org that never chooses anything renders identically).
2. Port `brand.test.ts` and `contrast.test.ts` — they're the proof the palette
   can't go illegible, and they run in our existing vitest setup unchanged.
3. `organizations.theme = v.optional(v.object({ brandHex, presetId, updatedAt }))`
   — an optional field, so no migration.
4. `convex/organizations.ts` — `getTheme` / `setTheme`, admin-gated, validating
   the hex strictly (their error message names the accepted form, which is what
   an admin pasting `rgb(37, 99, 235)` from a brand guide needs).
5. `src/components/brand-provider.tsx` — port `ui-web/src/brand.tsx` with the
   `resolvedTheme` fix; mount inside `theme-provider` in `App.tsx`, fed by
   `useOrganization()`. A colour that fails to parse must not take the app
   down — return and keep our palette.
6. Branding tab in `settings-dialog.tsx`: presets, hex field, live preview, and
   the adjustments list ("your link colour was darkened to stay readable").
7. Add `brand_hex` to the public share/give/check-in payloads and wrap those
   pages in the same provider. Behind `release.org_branding`.

**Effort:** ~1 day for tokens + panel, ~half a day for the public pages.
**Risk:** low, and contained — branding is an override, and our own palette is a
complete fallback.

---

## 4. Inspiration, not ports

### Tenancy choke point — adopt incrementally

`convex/lib/tenancy.ts` hands feature code an org-scoped database handle from
which a cross-tenant read or write **is not expressible**, and the set of scoped
tables is **derived from the schema** rather than hand-listed (they had the bug
where a new table was added to the schema and not to the list, so its reads
skipped the ownership check). An ESLint rule plus a CI grep forbid `ctx.db`
outside `lib/`.

We are the "legacy platform" in that comparison: `organization_id` is a column
each of our functions filters on by convention. Our directory-share work last
session is a live example — the safety of the link rests on remembering to
intersect with `resolveManagedMemberIds`.

Porting this wholesale is a multi-week refactor across 200+ functions and is not
worth doing as one change. The incremental path:

1. Add `scopedReader` / `scopedWriter` in `convex/lib/tenancy.ts`, deriving the
   scoped-table set from our schema's `organization_id` field.
2. Use it in **new** code only.
3. Convert the highest-risk modules first: `members.ts`, `financial.ts`,
   `attendance.ts`, `memberShares.ts`.
4. Only once most call sites are converted is the ESLint ban worth adding —
   a lint rule with fifty exemptions teaches nothing.

### Authorisation-matrix test — the highest-value test we don't have

`convex/tests/authz-matrix.test.ts` exercises every client-callable function
against every principal type, in its own org and a foreign one, and **fails when
a new public function isn't listed**. We have no `convex-test` at all — our
convex tests are pure-function unit tests (`attendance.test.ts`,
`entitlements.test.ts`).

For an app holding names, phone numbers, addresses and giving records, this is
the test investment I'd argue for hardest. It needs `convex-test` and
`@edge-runtime/vm` installed and a second vitest project with
`environment: "edge-runtime"`. Start with a matrix over `members`, `financial`
and `memberShares` rather than the whole API.

### Typed error codes — port now, it's 55 lines

`appError("FEATURE_DISABLED", …)` vs our `throw new Error("Forbidden")`. Their
distinction is worth having: `FORBIDDEN` says "you may not", `FEATURE_DISABLED`
says "nobody here may, yet" — a user told the wrong one goes and asks for a role
that wouldn't help. Flags need this distinction anyway, so it comes along with
§1. Use `ConvexError` with a code, which we already use in `entitlements.ts`.

### Rate limiter — when we need it

`convex/lib/rateLimit.ts` keys on the authenticated principal rather than IP
(their legacy platform's IP keying puts a whole exam centre behind one NAT in a
single bucket while a distributed attacker gets a fresh bucket per IP). We have
SMS caps in `automation/dispatch.ts` but nothing generic. Candidates if we ever
need it: share-link creation, full exports, check-in scans. Not urgent. Note the
Convex guidelines recommend `@convex-dev/rate-limiter` over a hand-rolled
counter for this, so prefer the component over the port.

---

## 5. Suggested sequence

**Phase 0 — error codes** — **done.** `convex/lib/errors.ts` (`appError`,
`forbidden`, `notFound`, `featureDisabled`), `src/lib/errors.ts`
(`errorMessage` / `errorCode` / `isPlanError`), and `entitlements.ts` routed
through it. Note `errorMessage` also fixes a live bug: a `ConvexError`'s useful
text is in `err.data.message`, and several toasts were showing the `[CONVEX]`
wrapper instead.

**Phase 1 — feature flags** — **done, live on dev.** Catalogue +
resolution + 17 tests in `convex/lib/flags/`, `feature_flags` table,
`convex/flags.ts` (resolved / catalogue / set / clearOverride, audited),
`convex/lib/flags/server.ts` (`isFlagEnabled` / `requireFlag`),
`src/hooks/use-flags.ts`, and a console at Admin → Feature Flags.
`kill.automations` now fronts `guardrails.isAutomationEnabled` (the old
`app_config` row is still honoured for one release); member list sharing is
gated by `release.member_list_share` + `kill.public_shares`.

One decision taken during implementation: the shared catalogue lives under
`convex/lib/flags/`, not `src/lib/flags/` as written above. The backend must
import it, and the Convex bundler can't resolve our `@/` alias — keeping it
under `convex/` means the import only ever goes one way, which is the direction
`src` already reaches for `_generated/api`.

**Phase 2 — brand theming** — **done, live on dev.** `convex/lib/theme/`
(oklch, contrast, brand, chart, presets, css) with 38 tests,
`organizations.theme`, `getTheme` / `setTheme` / `clearTheme`,
`BrandProvider` + `OrgBrand`, a Branding tab in the org settings dialog with a
live preview, and `brand_hex` riding on the giving, check-in and both share
payloads so the public pages are branded too. All behind
`release.org_branding` (default off).

Two departures from the plan above. The nav-gradient tokens were dropped rather
than adapted: they exist to keep white text legible on a deep navigation bar,
and our sidebar is a light surface with dark text, so porting them would have
meant carrying someone else's measurements for a component we don't have.
Hover/active fills went too — our components reach for `hover:bg-primary/90`,
not a token. And `theme-provider.tsx` now exposes `resolvedTheme`, derived
through `useSyncExternalStore` rather than stored: the brand paints resolved
values, so it must repaint when the OS flips at sunset, and the obvious
implementation (setState inside the effect that applies the class) cascades a
render and trips the react-hooks lint.

**Phase 3 — BYOK AI credentials** — **done, live on dev.**
`convex/lib/secretBox.ts` (AES-256-GCM, 9 tests), the `ai_credentials` table,
`ai/credentials.ts` (`set` / `clear` / `test` actions), `ai/internal.ts`
(`store` / `remove` / `noteUse` / `credentialFor` / `forCredentialChange`),
`convex/lib/aiProviders.ts` (org key → deployment key → nothing), an `AI` tab
in settings, and a new `ai_copilot` Pro entitlement. No AI feature is attached:
the vault first, so the Copilot work starts with the privacy story already
true.

Confirmed while porting: `crypto.subtle` must work in Convex's default runtime,
because `credentialFor` decrypts inside a QUERY, which can never be `"use
node"`. CodeOS relies on exactly that, so the `"use node"` on their
`credentials.ts` is vestigial and none of ours carries it.

Added beyond the plan: a `test` action that makes a real one-token request and
records the result. It is a button rather than something `set` does, because
saving a key and reaching a vendor are different failures — and without it the
first thing to exercise a new key would be a drafting job at 6am on a Sunday.
It is also what makes `last_used_at` / `last_error` real rather than
decorative.

**Before this can be used:** `npx convex env set AI_CREDENTIAL_KEY "$(openssl
rand -base64 32)"` on each deployment. Without it, saving a key fails loudly
instead of storing plaintext — see the README. Set on dev on 2026-09-15; **not
yet set on prod**, and a deploy there without it leaves the AI tab able to
refuse but not to save.

Verified on the dev runtime rather than assumed: a throwaway internal function
sealed and opened a secret inside both an action and a QUERY, confirming
`crypto.subtle` is available where `credentialFor` needs it. The function was
removed immediately afterwards.

**Then, separately:** the Copilot itself (its own plan), the tenancy handle as
new code lands, and the authz matrix when we're ready to add `convex-test`.

Total for phases 0–3: **roughly a week**, all of it independent of the Copilot's
own scope.

---

## 5a. Deployment status (2026-09-15)

All three phases are pushed to **dev** (`efficient-turtle-154`,
`digitalix:sotf:dev/daniel-abakah`) and exercised there. Nothing has gone to
prod.

Schema changes were additive — three new tables (`feature_flags`,
`ai_credentials`, `member_list_shares`) and one optional field
(`organizations.theme`) — so no migration was needed and existing rows stayed
valid.

Checked against the live deployment:

- `flags:resolved` unauthenticated returns every kill switch ON and each
  release flag at its declared default, with zero rows in the table — the
  CodeOS regression, not reproduced here.
- `flags:catalogue`, `flags:set`, `ai/queries:status` and
  `organizations:getTheme` all refuse an unauthenticated caller.
- `memberShares:getByToken` and `absentShares:getByToken` answer
  unauthenticated and return null for an unknown token.
- Seal/open round-trips inside a Convex action and query (see Phase 3).

Still to do before prod: set `AI_CREDENTIAL_KEY` there, and decide whether
`release.org_branding` goes on globally or per-organization.

---

## 6. What we are deliberately not taking

- **Notifications catalogue + outbox.** We already have `convex/notifications.ts`
  and an automation dispatch pipeline with consent, quiet hours and rate caps.
  Theirs is good; ours is not the gap.
- **Webhooks / outbox** (`convex/lib/outbox.ts`, `webhooks.ts`) — worth
  revisiting only if we add third-party integrations.
- **PDF** (`packages/pdf`) — plausible later for printable reports; we currently
  export CSV/xlsx and nobody has asked.
- **Editor, gateway, LTI, proctoring, Judge0, learning, skill graph** — none of
  it has an analogue here.
