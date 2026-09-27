#!/usr/bin/env bash
# Runs RecallLater's on-device OCR over every image/PDF under the given dataset folders
# (fast: no UI), via the dev-only `dev-ocr` route. Needs a dev build running on an
# emulator with Metro. Writes the raw results to OUT (default e2e/out/ocr-batch.json).
#
#   OUT=e2e/out/ocr-batch-26.json e2e/ocr-batch.sh ~/Downloads/RecallLater_realistic_dataset
#   e2e/ocr-batch.sh ~/Downloads/RecallLater_100_realistic
#
# Run one dataset per call: a combined run on 2026-09-27 returned results for only the
# last dataset (cause not yet found).
set -euo pipefail

APP=com.srbmaury.recalllater
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
MAESTRO="$(command -v maestro || echo "$HOME/.maestro/bin/maestro")"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="${OUT:-$(pwd)/e2e/out/ocr-batch.json}"
METRO_PORT="${METRO_PORT:-8081}"
TMP=/data/local/tmp/rl-ocr-batch
mkdir -p "$(dirname "$OUT")"

"$ADB" shell "rm -rf $TMP && mkdir -p $TMP"
"$ADB" shell run-as "$APP" sh -c "'rm -rf files/ocr-batch && mkdir -p files/ocr-batch'"
count=0
for dataset in "$@"; do
  name="$(basename "$dataset")"
  while IFS= read -r path; do
    rel="${path#"$dataset"/}"
    # Flatten "images/001_x.jpg" to "<dataset>__images__001_x.jpg" so names stay unique.
    flat="${name}__${rel//\//__}"
    "$ADB" push "$path" "$TMP/$flat" >/dev/null
    count=$((count + 1))
  done < <(find "$dataset" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.pdf' \) ! -name 'contact_sheet*' | sort)
done
"$ADB" shell chmod -R a+r "$TMP"
"$ADB" shell run-as "$APP" sh -c "'cp $TMP/* files/ocr-batch/'"
echo "Pushed $count files; running OCR on the device…"

"$ADB" reverse "tcp:${METRO_PORT}" "tcp:${METRO_PORT}" >/dev/null
"$ADB" shell am force-stop "$APP"
DEV_URL="http://127.0.0.1:${METRO_PORT}"
ENCODED_DEV_URL="${DEV_URL//:/%3A}"
ENCODED_DEV_URL="${ENCODED_DEV_URL//\//%2F}"
"$ADB" shell am start -a android.intent.action.VIEW -d "recalllater://expo-development-client/?url=${ENCODED_DEV_URL}" "$APP" >/dev/null
sleep 15
"$MAESTRO" test "$DIR/flows/00-dismiss-dev-menu.yaml"
"$ADB" shell am start -a android.intent.action.VIEW -d recalllater://dev-ocr "$APP" >/dev/null
until "$ADB" shell run-as "$APP" test -f files/ocr-batch/results.json; do sleep 3; done
"$ADB" exec-out run-as "$APP" cat files/ocr-batch/results.json > "$OUT"
"$ADB" shell "rm -rf $TMP"
echo "Wrote $(python3 -c "import json;print(len(json.load(open('$OUT'))))") results to $OUT"
