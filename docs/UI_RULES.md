# UI and copy rules (for the Phase 3 screen pass)

Read with `docs/UI_AUDIT.md`. Every screen should read and look like one product.

## Components to use

- `@/components/ui/page-header` `PageHeader` for the page title (already applied to
  top-level pages; don't add a second one).
- `@/components/ui/stat-card` `StatCard` / `StatGrid` for any figure-with-label card.
- `@/components/ui/member-avatar` `MemberAvatar` for any person's picture.
- `@/components/ui/empty-state` `EmptyState` for "nothing here yet" blocks: an icon,
  a one-line title saying what is missing, one line on how to add it, and the
  action button when there is one.
- `@/components/ui/no-access` `NoAccess` for permission denials (after the role has loaded).
- `@/lib/money` `useMoney()` / `formatMoney(amount, currency)` for every amount. Never
  hard-code "$", "₵", "GHS" or a locale.
- lucide-react for icons (not hugeicons in new code).

## Visual

- Theme colours only: `primary`, `success`, `warning`, `info`, `destructive` (and their
  `-strong` shades for status written as text), `muted`, `foreground`,
  `muted-foreground`, `border`, `card`. A test fails on raw Tailwind palette classes
  (`bg-blue-500`, `text-slate-600`…) and hex classes.
- No coloured icon tiles or tinted icon squares as decoration; an icon beside a
  heading is small and `text-muted-foreground`.
- No gradients, glows, `hover-lift`, per-card animation delays, or `rounded-[32px]`
  one-offs. Cards: `rounded-xl bg-card ring-1 ring-foreground/10` (the Card default).
- Type: sentence case everywhere; section headings `text-base`/`text-lg font-semibold`;
  body `text-sm`; small print `text-xs`. Avoid arbitrary sizes like `text-[10px]`:
  nothing smaller than `text-xs` (12px) except a tabular figure in a dense table.
- Status badges: the shared `Badge` with a tone (`bg-success/15 text-success-strong`
  etc.), sentence case ("Active", "High risk"), never ALL CAPS unless a short
  overline label.
- Phones (390 px): nothing clips or scrolls sideways except a table inside its own
  scroll container; tab rows either fit or scroll horizontally with `overflow-x-auto`;
  filter panels collapse behind a "Filters" button when they would push content
  below the fold; stat cards two across.
- Dark mode: check any hard-coded `text-white`/`bg-white`/`bg-black` still reads.

## Copy

- Plain, warm, specific. Say what a thing is and what to do. No jargon or sci-fi
  ("protocol", "architecture", "node", "tactical", "params", "clearance",
  "taxonomy", "operational summary", "fiscal health").
- Sentence case for titles, buttons, labels, tabs and table headers.
- No em dashes (—) in any visible string; use a full stop, comma, colon or
  parentheses. Use the ellipsis character (…) not "...".
- System messages: no "successfully", no "Please", no exclamation marks.
  Toasts: title is what happened ("Member added"); drop generic "Success"/"Error"
  titles in favour of a specific one ("Couldn't save the member") with the reason
  as the description.
- Show values as people read them: names not IDs; "Active" not `active`;
  "Organization admin" not `organization_admin`; "member updated" not
  `member.updated`; dates like "26 Sep 2026" (use `toLocaleDateString('en-GB',
  { day: 'numeric', month: 'short', year: 'numeric' })` or an existing helper), never
  ISO strings; event and event-type names in title case as a church would write them
  ("Sunday service") even if stored in lower case.
- One word per concept: "member" (not congregant/person/profile), "unit" as the
  generic structure word but prefer the church's terminology hook where the
  component already has it, "event" for a scheduled gathering and "service" only for
  worship services, "check-in" (noun) / "check in" (verb), "care task", "follow-up".
- Money: always the church's currency via `useMoney()`.
- Never invent numbers or trends; if a figure isn't computed from data, remove it.

## Process

- Don't run any git command (no stash, checkout, reset, show, commit, diff apply).
  Other agents edit other files in the same working tree at the same time.
- Before editing, run `npx eslint <your files>` and note the error count; afterwards
  the count must not go up.
- After editing: `npx tsc -b --pretty false` clean for your files, `npx vitest run`
  green (update only expectations that asserted text you changed; never weaken the
  design-guard test).
- Keep behaviour identical: same queries, mutations, conditions and handlers. This
  pass changes presentation and words, not logic, unless a finding is a bug.
