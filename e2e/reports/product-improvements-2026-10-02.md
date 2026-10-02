# Product improvements — 2 October 2026

Implemented the six changes approved after the product review:

1. Today exposes a counted Older overdue section for unresolved items older than 30 days. Items already surfaced by a reminder are not duplicated. Completion removes them from the section; item details retain archive controls.
2. Back and Discard ask for confirmation after edits, including field drafts, type and reminder changes. Keep editing preserves corrections; saving still blocks discard.
3. Share review leads with extracted fields and the suggested reminder. Type changes, optional AI, recurrence, and extracted source text are under More options.
4. No reminder stays visible in both compact and expanded reminder controls. The primary action says Save only or Save & remind.
5. Inbox confirms the actual first scheduled time, daily until-done behavior, or no reminder, with an Edit saved item action. Each save gets a distinct confirmation, including repeated duplicate updates. Permission loss, elapsed reminders, and canceled duplicate dialogs have regression coverage.
6. Collections shows Done and Archived immediately, prioritizes populated collections, and exposes empty categories through Browse all collections. All categories remain available.

## Verification

- Lint and TypeScript typecheck passed.
- Jest: 26 suites, 221 tests passed.
- Product acceptance checks passed on the isolated Android 14 / API 34 ARM64 emulator using Metro and the existing development client. Synthetic flows cover edited Back/cancel, save-only and Edit confirmation, completion of an older overdue bill, history access, populated/empty collections, advanced options, reminder selection, actual scheduled-reminder confirmation, and confirmation dismissal.
- Earlier review regressions passed again on the same emulator: duplicate reminder removal, traversal-backup rejection, delayed AI correction/Undo, and notification Paid action held behind canceled authentication until successful unlock. AI verification used a local synthetic responder with no provider call.
- Independent read-only code review found no remaining important issue after its findings were reproduced and fixed.

Run product acceptance with `ANDROID_SERIAL=<isolated-emulator> ./e2e/product-improvements.sh`. The script refuses to reset an AVD other than recalllater_verify. It requires Metro on port 8081, the installed development client, Node, Maestro, and JDK 21.

No new dependencies, native changes, account requirements, or shared-content network calls were introduced. iOS was not exercised. The existing full intake/backup suite was not rerun in this product pass; see the separate review verification report for its earlier results.
