---
format: 1920x1080
duration: 80s
message: "Floc takes care of the Sunday admin and tells a church who has started drifting away, so someone can reach them in time."
arc: a quiet absence nobody noticed → Floc → Sunday check-in → the week at a glance → who is drifting → one member's story → the list goes to the callers → giving → everything else → free to start
audience: "Pastors, church administrators and ministry leaders"
mode: autonomous
music: none
---

## Video direction

- Read frame.md first; copy its @font-face block into every frame.
- Grounds: ink for Frame 1 (hook) and Frame 11 (close); cream for everything else. Frame 2 (brand) is cream.
- One statement on screen at a time, Fraunces, sentence case. Sub-lines in Inter.
- Screens in `screen-window` / `phone-window`. Callouts pinned to the measured regions below.
- Coordinates are source pixels. Desktop captures 2880x1800; shown at 1224x765 the display scale is 0.425.
- Every frame's timeline must fill its duration (end with `tl.set({}, {}, <duration>)`). The index adds 0.5s cross-transitions at the joins, so keep the first 0.4s and last 0.4s calm.
- Negative list: no gradients or glows on cream, no cursor, no invented numbers, no em dashes, no uppercase except docket labels, nothing important in the bottom 17%.

## Asset inventory (measured, source px)

- dashboard.png: 4 stat cards y 288-562 (Total members 346 at x 559-1105; Attendance 16 "-50% vs last week" x 1136-1680; Active units 24 x 1712-2256; Upcoming events x 2288-2834). Attendance overview chart x 560-1839, y 609-1511. Recent members x 1885-2832, y 609-1511.
- cc-live.png: stat cards y 356-572 (Checked in today 16 at x 560-1104). Session card "Sunday Service, Open, 16 checked in, Close / Kiosk / Absent link" x 560-1303, y 796-1076; Absent link button centre (1060, 1015). "Open check-in" chips row y 1195-1250, x 560-1590.
- qr-modal.png (770x708): the check-in QR modal "Sunday Service"; QR x 185-585, y 155-555; caption "Members scan this with their phone camera to check in." at y 660.
- kiosk-busy.png: kiosk for Sunday Service, Grace Chapel · 27 Sep 2026. Title (137-410, 50). "Open" badge (2513, 68); "16 checked in" x 2592-2830, y 68. Search box x 48-2066, y 184-314. "Recently checked in" list x 2112-2830, y 187-1325.
- care.png: Care impact card x 560-2832, y 436-864. Care queue rows from y 922; first row (Gideon Oduro-Ofori) y 936-1044: chip "9 weeks since last seen" centre (986, 1011); "High priority" badge centre (2534, 991); "Follow up" button centre (2719, 991). Rows repeat every ~130 px.
- member-profile.png: member dialog x 768-2112, y 89-1711 over a blurred page. Name "Abigail Agyei" (976-1218, 166). Stat "11 Missed in a row" card x 1663-2065, y 386-547. Engagement card: score 30 at (850, 1493), "High risk" badge centre (1314, 1495). Attendance history list (Sunday Service, Absent, week after week) x 1463-2065, y 1080-1591.
- share-dialog-top.png (2800x250): "Share the absent list" title at (28-350, 45); warning sentence y 97; crimson "Create a new link" button x 30-2778, y 150-210.
- phone-absent.png (1170x2532): public page "Grace Chapel / Who was missing / Sunday Service · 27 Sep 2026". Heading (98-555, 282). First card x 98-1076, y 759-1124: "Missed 11 in a row" badge centre (318, 1020); phone number centre (700, 1020). Cards repeat every ~365 px.
- financial.png: stat cards y 372-588 (Total income GH₵8,095.00 x 560-1104; Total expenses GH₵915.00 x 1136-1680; Net GH₵7,180.00 x 1712-2256). Monthly report cards y 1060-1335. Top income list x 592-1672, y 1382-1742 (Tithes row y 1479, Offerings 1592, Missions 1706). Top expenses x 1720-2800, y 1382-1640.
- members.png: Members page; "392 members" (2714, 628); table x 560-2832, y 907-1800.
- attendance.png: Attendance page; stat cards y 468-742; tabs Record/Check-in/History/Absent/Summaries x 569-1627, y 821.
- reports.png: weekly attendance line chart x 560-2832, y 740-1679.
- automations.png: rule "Absence follow-up", trigger "Member reaches N consecutive absences", Draft + Dry run badges, Simulate; row x 560-2832, y 840-1008.
- events.png, organization.png: full pages (use only as montage tiles).

## Frame 1 — Someone stopped coming
- duration: 7s · ground: ink · src: compositions/frames/01-hook.html
- Scene 1 (0.2-2.4s): "Nine Sundays ago, someone stopped coming." Fraunces 88px cream, left-aligned at x 160, y ~330, per-word rise.
- Scene 2 (2.6-4.4s): beneath, Inter 32px #A8A29E: "No one meant to miss it."
- Scene 3 (4.6-6.4s): the first two lines dim to 35%; a third line in Fraunces 60px, #E8567A: "In a church of hundreds, people slip away quietly." Then hold still.
- Ambient: a very faint row of nine small circles (Sundays) along y ~760, x 160-900, filling in one by one as empty outlines during Scene 1-2 (0.6s apart); the last one pulses once in #E8567A. Subtle, 30% opacity.

## Frame 2 — Floc
- duration: 4.5s · ground: cream · src: compositions/frames/02-brand.html
- Scene 1 (0.2-1.4s): the mark tile (120px) scales from 0.9 with a settle, centred; "Floc" wordmark (Fraunces 500, 110px, ink) slides in beside it.
- Scene 2 (1.4-2.2s): a 2px crimson rule draws beneath from the centre.
- Scene 3 (2.2-4.5s): "Make sure no one slips away." Fraunces 56px ink, per-word, centred under the rule. Hold.

## Frame 3 — Sunday check-in
- duration: 9s · src: compositions/frames/03-check-in.html
- Docket `01 ── Sunday`. Statement: "Members check themselves in."
- Scene 1 (0.2-1.6s): docket, statement per-word; the qr-modal card (shown ~540px wide, 16px radius, shadow) rises into the right side, centred at x ~1250, y ~470.
- Scene 2 (1.8-3.4s): callout on the QR: "Scan with a phone camera".
- Scene 3 (3.6-5.2s): the QR card slides left/back and shrinks to 60% (behind), while the kiosk-busy screen-window rises in front on the right (1224x765).
- Scene 4 (5.2-7.2s): camera pushes (S 1.8) to the "Recently checked in" list; callout "Or find your name at the kiosk" pointing at the search box first (at 5.4), then a second callout "16 checked in" at the top-right counter (at 6.4).
- Scene 5 (7.2-9s): hold.

## Frame 4 — Live on the day
- duration: 6.5s · src: compositions/frames/04-live.html
- Statement: "Leaders see who has arrived, as it happens."
- Scene 1 (0.2-1.4s): statement; cc-live screen-window rises.
- Scene 2 (1.6-3.4s): push (S 2.0) to the "Checked in today 16" card; callout "Updates as people check in".
- Scene 3 (3.6-5.4s): pan down to the session card; callout on the Absent link button: "The absent list, ready to share".
- Scene 4: hold.

## Frame 5 — The week at a glance
- duration: 7.5s · src: compositions/frames/05-dashboard.html
- Docket `02 ── Monday`. Statement: "The week at a glance."
- Scene 1 (0.2-1.6s): docket, statement; dashboard screen-window rises.
- Scene 2 (1.8-3.4s): push (S 2.0) to the stat row, centred on Total members + Attendance; callout on Attendance: "Down on last week".
- Scene 3 (3.6-5.4s): pull to the attendance chart (S 1.5); callout "Every service, week by week".
- Scene 4 (5.6-7.5s): settle to the recent members panel; callout "New members, as they join". Hold.

## Frame 6 — Who is drifting
- duration: 8.5s · src: compositions/frames/06-care.html
- Docket `03 ── Care`. Statement: "Floc tells you who has started drifting."
- Scene 1 (0.2-1.6s): docket, statement; care screen-window rises.
- Scene 2 (1.8-3.6s): push (S 1.9) to the first queue row; callout on the chip: "9 weeks since last seen".
- Scene 3 (3.8-5.4s): along the row to "High priority"; callout "Who to reach first".
- Scene 4 (5.6-7.2s): callout on "Follow up": "One tap starts a follow-up".
- Scene 5: hold.

## Frame 7 — One member
- duration: 7.5s · src: compositions/frames/07-profile.html
- Statement: "Every absence is noticed."
- Scene 1 (0.2-1.6s): statement; member-profile screen-window rises (crop the window to the dialog region x 700-2180 if it reads better; keep the blurred page edge).
- Scene 2 (1.8-3.4s): push (S 1.9) to the "11 Missed in a row" card; callout "Missed 11 in a row" is already on screen, so use a crimson ring/underline on the card plus tag "Counted for you".
- Scene 3 (3.6-5.4s): pan to the attendance history list; callout "Absent, week after week".
- Scene 4 (5.6-7.5s): to the engagement card; callout on "High risk": "Flagged before it is too late". Hold.

## Frame 8 — The list goes to the callers
- duration: 9s · src: compositions/frames/08-share.html
- Statement: "Send the list to the people who will call."
- Sub-line (appears at 6.2s): "No sign-in needed. Turn the link off at any time."
- Scene 1 (0.2-1.8s): statement; share-dialog-top shown as a card (width ~1180px, left edge x 600, y ~200) rising in.
- Scene 2 (2.0-3.2s): the "Create a new link" button pulses once (a crimson ring scale 1 → 1.03, no cursor).
- Scene 3 (3.2-5.0s): the dialog card slides up and fades to 40%; the phone-window with phone-absent.png rises from below at x ~1180-1570 (390 wide, height 844), centred.
- Scene 4 (5.0-7.0s): inside the phone, the page scrolls gently up ~300 source px, settles; callouts to the left of the phone: "Missed 11 in a row" and "Tap to call".
- Scene 5: sub-line appears; hold.

## Frame 9 — Giving
- duration: 7.5s · src: compositions/frames/09-finance.html
- Docket `04 ── Giving`. Statement: "Tithes, offerings and expenses, in your own currency."
- Scene 1 (0.2-1.6s): docket, statement; financial screen-window rises.
- Scene 2 (1.8-3.4s): push (S 2.0) to the stat row (Total income, expenses, net); callout on Net: "What came in, what went out".
- Scene 3 (3.6-5.6s): pan to Top income; callout on Tithes: "By category, service by service".
- Scene 4: hold.

## Frame 10 — Everything else
- duration: 7s · src: compositions/frames/10-everything.html
- Statement (centred top, y ~150): "Everything else your church runs on."
- Scene 1 (0.2-1.4s): statement.
- Scene 2 (1.4-4.4s): a 2x2 grid of screen-windows (each ~720x450, gap 40, grid centred below the statement, top ~290) enters one by one 0.5s apart: members.png "Members and households", attendance.png "Attendance", reports.png "Reports and trends", automations.png "Automations". Each tile has its label as a small tag at its top-left corner. Tiles show the top-left region of each capture (scale so width 2880 → 720).
- Scene 3 (4.6-7s): hold, with at most a 1% slow settle.

## Frame 11 — Close
- duration: 6.5s · ground: ink · src: compositions/frames/11-close.html
- Scene 1 (0.2-1.4s): mark tile + "Floc" wordmark in cream, centred at y ~380.
- Scene 2 (1.4-2.6s): "Make sure no one slips away." Fraunces 64px cream, centred.
- Scene 3 (2.8-4.2s): three chips in a row, Inter 24px, cream text on rgba(250,247,241,0.08) with a 1px rgba(250,247,241,0.2) border, pill radius, 0.25s apart: "Free for up to 200 members", "No card needed", "Set up the same day".
- Scene 4 (4.2-6.5s): dead-still hold.
