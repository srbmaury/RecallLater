#!/usr/bin/env bash
# Run only on the isolated recalllater_verify AVD; never reset a user's emulator.
# Requires the development client and Metro at :8081. Starts a local fake AI server.
set -euo pipefail
APP=com.srbmaury.recalllater
DIR="$(cd "$(dirname "$0")" && pwd)"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
export MAESTRO_CLI_NO_ANALYTICS=1
: "${ANDROID_SERIAL:?Set ANDROID_SERIAL to the isolated test emulator}"
[[ "$("$ADB" shell getprop ro.boot.qemu.avd_name | tr -d '\r')" == recalllater_verify ]] || {
  echo 'Refusing to reset an emulator other than recalllater_verify' >&2; exit 1;
}
flow() { "$MAESTRO" test "$DIR/flows/$1.yaml"; }
share_bill() {
  "$ADB" shell am start -a android.intent.action.SEND -t text/plain \
    --es android.intent.extra.TEXT "'Electricity Bill ₹2,840 Due 28 Sep 2030'" "$APP" >/dev/null
}
"$ADB" shell pm clear "$APP" >/dev/null
"$ADB" shell pm grant "$APP" android.permission.POST_NOTIFICATIONS
"$ADB" reverse tcp:8081 tcp:8081
TEMP_DIR="$(mktemp -d)"
node "$DIR/delayed-ai.mjs" > "$TEMP_DIR/ai.log" 2>&1 &
AI_PID=$!
trap 'kill "$AI_PID" 2>/dev/null || true; rm -rf "$TEMP_DIR"' EXIT
"$ADB" reverse tcp:8787 tcp:8788
"$ADB" shell am start -f 0x10008000 -a android.intent.action.VIEW \
  -d 'recalllater://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' "$APP" >/dev/null
flow 00-dismiss-dev-menu
flow 01-onboarding
share_bill
flow review/save-reminded-bill
share_bill
flow review/update-without-reminder

# Synthetic hostile backup, generated here rather than copied from anyone's device.
python3 - "$TEMP_DIR/RecallLater-unsafe.recalllater" <<'PY'
import json, sys
item = dict(id='hostile-backup', type='generic', title='Unsafe regression item', status='active',
            sourceType='file', extractedText='', fields={}, attachments=['../SQLite/recalllater.db'],
            confidence=0, dueAt=None, reminderMode='none', nextReminderAt=None,
            createdAt=1790899200000, updatedAt=1790899200000, completedAt=None)
with open(sys.argv[1], 'w') as f:
    json.dump(dict(app='recalllater', version=1, items=[item], files={}, settings={}), f)
PY
"$ADB" push "$TEMP_DIR/RecallLater-unsafe.recalllater" /sdcard/Download/RecallLater-unsafe.recalllater
flow review/reject-unsafe-backup
share_bill
flow review/ai-preserves-edits
# Only this synthetic AVD is allowed through the name guard above.
"$ADB" shell locksettings set-pin --old 1234 1234 2>/dev/null || "$ADB" shell locksettings set-pin 1234
flow review/enable-lock
"$ADB" shell input keyevent KEYCODE_HOME
sleep 32
"$ADB" shell cmd statusbar expand-notifications
flow review/locked-notification
printf '\nReview regression flows passed.\n'
