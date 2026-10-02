# Android review — 2 October 2026

Reviewed Android notification permissions and channels, reminder scheduling, share capture, native dialog dismissal and Back behavior, authentication lifecycle, decimal input, and native OCR/PDF boundaries. No important unresolved correctness findings remained in the reviewed changes.

## Fixes

- A disabled Reminders notification channel was treated as enabled when the global permission remained granted. Scheduling, Settings, digest refresh, and reminder reconciliation now check channel importance on Android API 26 and later. Channel setup precedes the permission request.
- Decimal-comma input such as `12,50` was saved as `1250`. Amount parsing now accepts decimal commas while preserving Indian and US grouping, with coverage for `1.234,50`, `1,234.50`, and `1,23,456`.

## Verification

- Android 14 / API 34 ARM64, isolated `recalllater_verify` AVD; synthetic bills only.
- Onboarding and decimal amount flow passed: `12,50` saved as ₹12.50 with no reminder.
- Disabled the Reminders channel in Android Settings while retaining global permission. The save flow reported notifications off, confirmed saving without a reminder, and item details showed no reminder. App Settings reported notifications off and exposed the enable action. All assertions passed.
- Flows were completed in segments: an initial dev-client reload failed before onboarding; a clean restart resolved it. Editing the running shell script interrupted a later run after channel disable, so the remaining blocked-channel flow was run separately and exited successfully.
- Lint and TypeScript checks passed. Jest: **26 suites, 228 tests passed** after the production changes. Shell syntax and Git whitespace checks passed.
- Earlier product and review acceptance flows are recorded in the adjacent reports; they were not all repeated during this Android-only pass.

No native source or dependency changes were needed. Documentation was checked against [Expo SDK 57 notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/), alongside the installed SDK implementation.

## Limits

This verifies a development client on API 34. Release builds, newer Android versions, physical-device OEM power management, and reminder delivery under Doze were not verified. The installed scheduling implementation permits inexact scheduling when exact alarms are unavailable; this review does not establish exact delivery timing.
