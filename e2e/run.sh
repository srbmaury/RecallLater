#!/usr/bin/env bash
# End-to-end tests on an Android emulator/device against a development build.
#
# Prerequisites:
#   - A dev build installed (`npm run android`) and Metro running (`npm start`)
#   - Maestro (https://maestro.mobile.dev) on PATH or in ~/.maestro/bin
#   - JDK 17+ in JAVA_HOME (Maestro needs it)
#
# Wipes the app's data: run it on a test device, not your daily phone.
set -euo pipefail

APP=com.srbmaury.recalllater
DIR="$(cd "$(dirname "$0")" && pwd)"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
MAESTRO="$(command -v maestro || echo "$HOME/.maestro/bin/maestro")"
METRO_PORT="${METRO_PORT:-8081}"
export MAESTRO_CLI_NO_ANALYTICS=1

step() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
flow() { step "flow $1"; "$MAESTRO" test "$DIR/flows/$1.yaml"; }

launch_app() {
  # NEW_TASK | CLEAR_TASK: a share from Files can leave the app inside Files' task, which
  # force-stopping Files takes down; always come back in a task of the app's own.
  "$ADB" shell am start -f 0x10008000 -a android.intent.action.VIEW \
    -d "recalllater://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${METRO_PORT}" "$APP" >/dev/null
  # The dev client reloads the JS bundle; a share sent before it's back gets lost.
  # A reload sometimes opens the dev menu on top of the app: close it and wait again.
  "$MAESTRO" test "$DIR/flows/00-wait-for-app.yaml" >/dev/null || {
    "$MAESTRO" test "$DIR/flows/00-dismiss-dev-menu.yaml" >/dev/null
    "$MAESTRO" test "$DIR/flows/00-wait-for-app.yaml"
  }
}

share_text() {
  step "share text: $1"
  "$ADB" shell am start -a android.intent.action.SEND -t text/plain \
    --es android.intent.extra.TEXT "'$1'" "$APP" >/dev/null
}

open_downloads() {
  # Files keeps its selection between launches; start clean so only one file is shared.
  "$ADB" shell am force-stop com.google.android.documentsui
  "$ADB" shell am start -a android.intent.action.VIEW -t vnd.android.document/root \
    -d content://com.android.providers.downloads.documents/root/downloads com.google.android.documentsui >/dev/null
}

step "reset app and fixtures"
"$ADB" shell pm clear "$APP" >/dev/null
"$ADB" shell pm grant "$APP" android.permission.POST_NOTIFICATIONS
"$ADB" reverse "tcp:${METRO_PORT}" "tcp:${METRO_PORT}" >/dev/null
for fixture in e2e-bill.jpg e2e-ticket.pdf e2e-color-bill.png e2e-boarding-pass.png e2e-wifi-qr.png e2e-hindi-bill.png e2e-mixed-bill.png; do
  "$ADB" push "$DIR/fixtures/$fixture" "/sdcard/Download/$fixture" >/dev/null
  "$ADB" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
    -d "file:///sdcard/Download/$fixture" >/dev/null
done
"$ADB" shell cmd statusbar collapse >/dev/null

launch_app
flow 01-onboarding

share_text "Can you send me the updated deck before we speak on Friday?"
flow 02-share-text-task

share_text "https://www.amazon.in/Sony-WH-1000XM6-Wireless-Headphones/dp/B0CXYZ1234"
flow 03-share-url-purchase

open_downloads
flow 04-share-image-bill

open_downloads
flow 05-share-pdf-ticket
"$ADB" shell am force-stop com.google.android.calendar
"$ADB" shell am force-stop com.google.android.documentsui
launch_app

flow 06-browse-and-search
flow 07-complete-item

flow 08-queue-reminder
step "wait for the reminder, then open the notification shade"
sleep 12
"$ADB" shell cmd statusbar expand-notifications
flow 09-notification-done

launch_app
share_text "Remind me to buy milk tomorrow"
flow 10-share-cancel

# Real-world layouts: colour, grids, labels above values.
open_downloads
flow 11-share-color-bill
open_downloads
flow 12-share-boarding-pass

# V1.5 collections.
share_text "Swiggy: Get ₹200 OFF with code DINNER200. Valid till 30 Sep 2026"
flow 13-share-coupon
share_text "We are hiring a Software Engineer II at Stripe in Bengaluru. 3+ years of experience. Apply by Dec 10"
flow 14-share-job
open_downloads
flow 15-share-wifi-qr

# In-app ＋ Add. The dev client's floating gear sits over the ＋ button (dev builds
# only), so drag it out of the way first.
"$ADB" shell input swipe 970 238 970 1300 800
flow 16-add-text

# The same coupon again is recognised by its code.
share_text "Swiggy: Get ₹200 OFF with code DINNER200. Valid till 30 Sep 2026"
flow 17-share-duplicate

share_text "Pay rent ₹25,000 by 5 Oct"
flow 18-recurring

# Backup: export, hand the file to Downloads as a person would, wipe, restore.
flow 19-backup
mkdir -p "$DIR/out"
# The app keeps only its newest export in the cache.
"$ADB" exec-out run-as "$APP" sh -c 'cat cache/*.recalllater' > "$DIR/out/backup.recalllater"
"$ADB" push "$DIR/out/backup.recalllater" /sdcard/Download/RecallLater-e2e.recalllater >/dev/null
"$ADB" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
  -d file:///sdcard/Download/RecallLater-e2e.recalllater >/dev/null
flow 20-restore

# Hindi and mixed Hindi–English, read on-device.
open_downloads
flow 21-share-hindi-bill
open_downloads
flow 22-share-mixed-bill

# Encrypted backup: export with a passphrase, wipe, restore (wrong passphrase first).
flow 23-encrypted-backup
"$ADB" exec-out run-as "$APP" sh -c 'cat cache/*.recalllater' > "$DIR/out/backup-encrypted.recalllater"
grep -q '"sealed"' "$DIR/out/backup-encrypted.recalllater"  # really encrypted
! grep -q 'Swiggy' "$DIR/out/backup-encrypted.recalllater"  # no readable content
"$ADB" push "$DIR/out/backup-encrypted.recalllater" /sdcard/Download/RecallLater-encrypted.recalllater >/dev/null
"$ADB" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
  -d file:///sdcard/Download/RecallLater-encrypted.recalllater >/dev/null
flow 23b-restore-encrypted

# A brand-new user tries the sample bill from the welcome screen.
step "reset app for first-run sample"
"$ADB" shell am force-stop com.google.android.documentsui  # left open by the restore's file picker
"$ADB" shell pm clear "$APP" >/dev/null
"$ADB" shell pm grant "$APP" android.permission.POST_NOTIFICATIONS
launch_app
"$MAESTRO" test "$DIR/flows/00-dismiss-dev-menu.yaml" >/dev/null  # dev builds introduce their menu after a wipe
flow 24-sample-bill

step "all flows passed"
