#!/usr/bin/env bash
# Targeted Android checks on synthetic data in the isolated AVD only.
set -euo pipefail
APP=com.srbmaury.recalllater
DIR="$(cd "$(dirname "$0")" && pwd)"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
export MAESTRO_CLI_NO_ANALYTICS=1
: "${ANDROID_SERIAL:?Set ANDROID_SERIAL to the isolated test emulator}"
[[ "$("$ADB" shell getprop ro.boot.qemu.avd_name | tr -d '\r')" == recalllater_verify ]] || {
  echo 'Refusing to reset any emulator except recalllater_verify' >&2; exit 1;
}
flow() { "$MAESTRO" test "$DIR/flows/$1.yaml"; }
share() { "$ADB" shell am start -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT "'$1'" "$APP" >/dev/null; }
"$ADB" shell am force-stop "$APP"
"$ADB" shell pm clear "$APP" >/dev/null
"$ADB" shell pm grant "$APP" android.permission.POST_NOTIFICATIONS
"$ADB" reverse tcp:8081 tcp:8081
"$ADB" shell am start -f 0x10008000 -a android.intent.action.VIEW -d 'recalllater://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' "$APP" >/dev/null
flow 00-dismiss-dev-menu
flow android/onboarding
share 'Electricity Bill ₹2840 Due 28 Oct 2030'
flow android/decimal-amount
"$ADB" shell am start -a android.settings.CHANNEL_NOTIFICATION_SETTINGS --es android.provider.extra.APP_PACKAGE "$APP" --es android.provider.extra.CHANNEL_ID reminders >/dev/null
flow android/disable-channel
share 'Electricity Bill ₹3100 Due 29 Oct 2030'
flow android/blocked-channel
printf '\nAndroid review flows passed.\n'
