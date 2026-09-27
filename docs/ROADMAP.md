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
