# UI audit (Phase 0)

Captured 26 Sep 2026 from the dev deployment, signed in as an organization admin
of a church with 346 members, at 1440×900 and 390×844, light and dark. Findings
are grouped by kind, then listed per screen. Severity: **bug** (broken or wrong),
**major** (reads as unfinished), **minor** (polish).

## Bugs

- **Organization** (`/organization`): an organization admin sees a stuck skeleton,
  then "Access Denied", on one load and the page on another. The access check
  renders its denial before the role has loaded.
- **Map** (`/map`): Google Maps fails ("Oops! Something went wrong", the Maps
  error page), leaving a grey box; in dark mode a white box. Needs a working key
  or a proper empty state when none is configured.
- **Settings → Profile**: a leftover template with fake data: "Zurich,
  Switzerland", "2445 Crosswind Drive", a stranger's email address, a date of
  birth, Facebook and Twitter fields. None of it is the user's.
- **Billing**: "Your organization has full access to sotf." (the old name); the
  raw status `Past_due`; "your plan updates automatically via webhook".
- **Financial**: amounts in US dollars ($35.00) for an organization whose giving
  is in cedis elsewhere; currency must come from the organization.
- **Labels**, dark mode: label cards lose their names (text colour not set for dark).
- **Events**: the stat "Unit Level 3s" is a terminology placeholder pluralised
  into nonsense; auto-created events are titled "sunday service (bouquet)-
  2026-07-05" (lower case, stray hyphen, ISO date).
- **Sign-in and Profile**: Clerk's default components, unthemed, "Sign in to
  State of the Flock", "Welcome back! Please sign in to continue".

## System-wide (major)

- **Page headers are inconsistent.** Members, Events, Treasury, Automations,
  Command Center (organization) and System Console carry a purple/indigo icon tile
  (off-brand); Attendance, Reports, Care, Command Center (live) and Billing have
  none; Care has a small red icon inline. Titles mix Title Case ("Reports &
  Analytics", "Label Management") and sentence case.
- **Names don't match the navigation.** Nav "Financial" opens "Treasury"; nav
  "Organization" opens "Command Center"; nav "Command Center" opens a different
  "Command Center"; nav "Settings" is personal settings while "System Console"
  (`/admin`) is organization settings; "Profile" and "Settings → Profile" overlap.
- **Stat cards vary screen to screen**: coloured top borders on some cards and not
  others (Dashboard), coloured icon squares (blue, purple, amber, pink) on
  Events/Financial/Organization, plain on Attendance and Command Center.
- **Off-brand colour**: purple and indigo tiles, blue top bars on label cards, a
  near-black "Create New Label" button where every other primary is crimson.
- **Sci-fi and jargon copy**: "Architectural oversight of…", "Global Params",
  "Central Command Interface / Tactical Configuration Node", "System Active",
  "Your security clearance is insufficient for organization architecture
  protocols", "Log attendance by selecting an event protocol and verified
  members", "Record Participation", "Define the taxonomy for classifying your
  community members", "Fiscal Health Good", "Records logged".
- **Raw values on screen**: `member.updated` action keys in the audit trail,
  `Past_due`, `organization admin` role strings, lower-case event type names
  ("sunday service", "midweek service") next to "Choir Rehearsal".
- **Empty avatars**: grey circles with no initials (Dashboard recent members,
  Members table), while Care uses initials. One avatar treatment everywhere.
- **Organization name** shows as "Makarios City Church - AshBotchWay" in subtitles
  (a hyphenated internal name) and truncated in the top bar.

## System-wide (minor)

- Dark mode works broadly; the active sidebar item is crimson on near-black and
  low in contrast.
- Tiny chips and badges (`text-[10px]`-ish) that are hard to read.
- Em dashes throughout copy ("Care impact · last 90 days … — not the total …").
- "My Portal" sits in an admin's sidebar under Overview; the member portal is
  reached from inside the admin shell.
- Reports: "Demographics (coming soon)" placeholder card; chart tooltip "Growth % : 66.7".

## Phone (390 wide)

- Page headers with icon tiles push content down (Members, Events, Treasury
  spend ~200px on a header).
- Tab rows overflow and clip ("onal Units", "Fe…" on System Console; Organization
  tabs cut off; Reports tabs stack oddly).
- Stat cards stack one per row with large empty space (Dashboard, Financial,
  Events): a 2-up grid would fit.
- Filters on Members take a full screen before the first member appears.
- Tables clip their last column (System Console "Act…").

## Screen by screen

| Screen | Priority | Main issues |
| --- | --- | --- |
| Dashboard | high | stat card treatments, "0 This Month" chip, blank avatars, Title Case headings, phone stacking |
| Members | high | purple header tile, filter card weight, blank avatars, dense table, phone filters |
| Attendance | high | "Record Participation"/"event protocol" copy, six stat cards, lower-case event types |
| Care | high | good structure; copy (em dashes), badge sizes |
| Command Center (live) | medium | empty state fine; lower-case session names; title clashes with Organization |
| Events | medium | icon squares, "Unit Level 3s", auto-created titles, purple tile |
| Financial ("Treasury") | high | USD, "Fiscal Health Good", coloured icon squares, title mismatch |
| Reports | medium | "coming soon" card, tooltip copy, Title Case |
| Organization ("Command Center") | high | access bug, sci-fi copy, purple tile, "Global Params" |
| Automations | medium | purple tile, em dash; otherwise clean |
| Map | high | Maps failure, dark white box |
| System Console (`/admin`) | high | sci-fi copy, purple tile, phone table |
| User Management | low | clean; username-only rows read oddly |
| Labels | medium | blue bars, black button, dark-mode text bug, "taxonomy" |
| Audit Trail | low | raw action keys |
| Settings | high | template with fake data; overlaps Profile |
| Billing | high | "sotf", `Past_due`, webhook copy, ₵0/mo |
| Profile | medium | unthemed Clerk component |
| Member portal | medium | sparse; plain empty states; lives inside admin shell |

## Order for Phase 3

Organization and Map bugs first (broken), then Settings/Billing (wrong content),
then Dashboard → Members → Attendance → Care → Financial → Organization → System
Console → Events → Reports → Labels → Automations → portal → the rest.
