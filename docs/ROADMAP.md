# RecallLater: next 10 features

Ordered by dependency and risk: quick JS-only wins first, then native work, then the
platform work that needs accounts. Each item ships with tests, and E2E coverage where a
flow can be driven on the emulator. Privacy rule for every item: nothing new leaves the
device, and any new permission is requested only at the moment it's used.

| # | Feature | Phase | Native change | Status |
|---|---|---|---|---|
| 3 | Snooze choices | 1 | – | done |
| 2 | Morning digest | 1 | – | done |
| 5 | Duplicate detection | 1 | – | done |
| 4 | Recurring items | 1 | – | done |
| 6 | Local backup and restore | 2 | – | done |
| 7 | App lock | 2 | expo-local-authentication | done |
| 9 | Take a photo in the app | 3 | camera permission (on use) | done |
| 8 | Hindi / Devanagari | 3 | ML Kit Devanagari model | done (Android); iOS unverified |
| 1 | Home-screen widget | 4 | Android widget library; iOS expo-widgets | done (Android); iOS after #10 |
| 10 | iOS build and verification | 4 | EAS cloud build | ready; needs your accounts |

## Phase 1: reminders that respect you (JS only)

**3. Snooze choices.** Notification actions become **Done · 1 hour · Tomorrow** (Android shows
at most three). In the app, Later on Today opens a small sheet: 1 hour, Tonight 7 PM,
Tomorrow 9 AM, Pick date & time. *Done when:* each choice reschedules correctly (unit tests
on the time maths), and the E2E notification flow still passes.

**2. Morning digest.** Settings: off / on at a chosen time (default 8:30 AM). Every time data
changes or the app opens, the next 7 days of digests are rescheduled with that day's items
computed from the database ("3 things today: Electricity bill, Rent, DEL → BLR"). Days with
nothing due get no digest. Individual reminders still fire. *Done when:* the digest content
builder is unit-tested and a scheduled digest is visible on the emulator.

**5. Duplicate detection.** Before saving, look for an active item with the same identity:
coupon code, PNR, order ID, URL, or same type + merchant/title + amount + due date. If found:
"You saved this on Sep 23. Update it / Save as new". *Done when:* the matcher has tests for
matches and near-misses, and updating keeps the original item's reminders consistent.

**4. Recurring items.** Items can repeat monthly, weekly or yearly (review and detail screens).
The parser suggests it for rent, EMI, SIP, subscription, "every month", "/month". Marking a
repeating item done creates the next occurrence with the same reminder offset. *Done when:*
date rollover is tested (31 Jan → 28/29 Feb, month ends) and the Today view shows the next one.

## Phase 2: trust and safety

**6. Local backup and restore.** Settings → Export: one `.recalllater` file (items, reminders,
settings, attachments), saved wherever the user chooses via the system share sheet. Import:
the system file picker, version check, merge without duplicates, reminders rescheduled. The
file isn't encrypted in this version; the UI says so plainly (passphrase encryption is a
follow-up). *Done when:* export → delete all → import restores everything (unit + manual test).

**7. App lock.** Settings: lock with fingerprint / face / device PIN (expo-local-authentication).
Locks on launch and after 5 minutes in the background; the app's screen is covered while
locked. *Done when:* verified on the emulator's fingerprint simulation.

## Phase 3: capture and language

**9. Take a photo in the app.** A fourth ＋ option, "Take a photo" (paper bills, receipts).
This is the one feature that needs the camera: the permission is requested only on first use,
and the privacy copy says so. *Done when:* the emulator camera photo goes through OCR and review.

**8. Hindi / Devanagari.** Add ML Kit's bundled Devanagari recognizer (Android) and verify
Vision's Hindi support (iOS). Parser: Devanagari digits → ASCII, Hindi month names, key words
(देय तिथि due date, कुल / राशि total/amount, बिल). *Done when:* Hindi and mixed Hindi–English
fixtures pass, and app size growth is measured and acceptable.
*Status:* Android reads both scripts and keeps, per line, the model that suits it (Hindi lines
from the Devanagari model, the rest from Latin); parser handles Devanagari digits, Hindi months,
labels, date-before-verb deadlines and common OCR slips (visarga for colon, श् for ₹). APK grew
4.2 MB. iOS relies on Vision's automatic language detection and needs checking on a device.

## Phase 4: platform reach

**1. Home-screen widget.** "Today" widget: count plus the next three items; tapping opens the
app or the item. Android via `react-native-android-widget` (updated whenever data changes);
iOS via `expo-widgets` (iOS-only in SDK 57; built but untestable without Xcode). *Done when:*
the Android widget is placed and updates on the emulator.
*Status:* Android done: placed on the emulator, redraws after every change and every 30
minutes, rows open their item, and with App lock on it shows counts only. The iOS widget
(`expo-widgets`, SwiftUI) waits for #10, since it can't be built or checked without iOS builds.

**10. iOS build and verification.** Add `eas.json` (development / preview profiles). **Needs the
owner:** an Expo account (`npx eas-cli@latest login`) and an Apple Developer account for device
builds / TestFlight. Then verify on a real iPhone: the share extension, Vision OCR, PDF text,
backup exclusion, notifications, the widget and app lock.
*Status:* `eas.json` is in place; this Mac has no Xcode, so iOS builds run on EAS. Steps:
1. `npx eas-cli@latest login`, then `npx eas-cli@latest init` (links the project to your account).
2. Without an Apple account: `npx eas-cli@latest build -p ios --profile development-simulator`
   builds for the iOS Simulator (needs Xcode on some Mac to run it).
3. With an Apple Developer account ($99/year): `npx eas-cli@latest device:create` to register
   your iPhone, then `npx eas-cli@latest build -p ios --profile development`, install from the
   link, and run `npx expo start` to load the app.
4. TestFlight: `npx eas-cli@latest build -p ios --profile production`, then
   `npx eas-cli@latest submit -p ios`.

## After the roadmap: accuracy and product gaps

Measured with `dataset.test.ts` (rules only, no AI). The 26-sample set and the 100-set train
split were used for tuning; the validation split was only checked; the test split was never
looked at, only scored.

| Set | Screenshots fully correct | All samples fully correct |
|---|---|---|
| 26-sample set | 7/16 → **15/16** | 12/26 → **25/26** |
| 100-set train | 69/70 → 69/70 | 86/87 → 86/87 |
| 100-set validation | 9/15 → 9/15 | 9/15 → 9/15 |
| 100-set test (held out) | 3/15 → 3/15 | 3/18 → **6/18** |

Parser fixes, each a general pattern rather than a sample-specific rule: app top bars and
social handles are never titles; captions like "New opening: *Name*" name the place; a
bullet misread as "e" between a date and time; "gates open" / "entry ₹…" mark events; a
code on its own line next to "… OFF" is a coupon code; job cards take the company from the
header line; book covers split over lines; "Recommended by" isn't an author; "servings" on
recipe cards; table bookings are places with a date and time; a PIN code must stand alone;
"invoice" alone no longer marks every date as the purchase date; "pay … bill/rent/EMI" is
a bill, so "Pay gas bill ₹850 today" is due today.

Product: guessed fields are marked **Check** on the review screen; corrections are counted
on the phone (Settings → Data); a bundled sample bill on the welcome screen; bill reminders
say **Paid**; the review screen shows what else is due that day; backups can be encrypted
with a passphrase (AES-256-GCM, PBKDF2-SHA256 600k rounds natively, JS fallback).

## New images and launch readiness (28–29 Sep 2026)

46 new generated images (RecallLater_new_images_part1), read by on-device OCR, now a regression
test (`new-images.test.ts`). First run, before any change: **10/46 fully correct**. After:
36/46 (type 43, amount 19/22, date 29/38, title 36/39). Unseen held-out test set: field accuracy
20 → 27 of 39. Findings: ML Kit never outputs ₹ (it becomes "7"), fixed only on money rows and
only when the page confirms it or no currency sign survived; slogans ("a brighter tomorrow")
were dates; table headings, codes and taglines were titles.

Launch readiness: real app icon and splash (Android adaptive + monochrome, iOS Icon Composer),
`docs/privacy-policy.md` and `docs/store-listing.md`, CI on every push
(`.github/workflows/ci.yml`), OCR timed at ~0.5 s per image on the emulator (both models),
E2E suite made independent of the date it runs on.

Still needs the owner: iOS build (Expo + Apple accounts), a hosted AI proxy or shipping without
AI, and a closed beta for real-world accuracy.

## Real receipts (29 Sep 2026)

~200 photographed US restaurant and store receipts with hand transcriptions (third-party data,
kept local; `real-receipts.test.ts` runs when `e2e/out` has it). First run, rules only:
**17/193 fully correct**, type 33/193, total 108/168, date 9/121. After: **131/193** fully
correct, type 190/193, total 124/168 (of 145 legible in OCR), date 99/121. No other set moved.
Changes: a receipt is recognised by its parts (subtotal, tax, total, payment, server/table,
tip/thanks, priced lines) whatever the shop sells; its total comes from its own arithmetic
(subtotal + tax), since photo OCR often puts values before their labels; pages with strong US
signs (a $, a state and ZIP, a "(562) 699-7484" phone) read dates month-first and bare amounts
as dollars. Indian pages are unaffected (tested).
