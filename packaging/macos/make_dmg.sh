#!/usr/bin/env bash
# Wrap the already-bundled .app with hdiutil. Used when Tauri's create-dmg
# AppleScript step fails (common in CI, Cursor terminals, and headless sessions).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEFAULT_APP="$ROOT/src-tauri/target/release/bundle/macos/Adelpha.app"
CARGO_APP="${CARGO_TARGET_DIR:+$CARGO_TARGET_DIR/release/bundle/macos/Adelpha.app}"
TRIPLE_APP="$(find "$ROOT/src-tauri/target" -path "*/bundle/macos/Adelpha.app" -type d 2>/dev/null | head -n 1 || true)"
if [[ -n "${ADELPHA_APP:-}" ]]; then
  APP="$ADELPHA_APP"
elif [[ -n "${CARGO_APP:-}" && -d "$CARGO_APP" ]]; then
  APP="$CARGO_APP"
elif [[ -d "$DEFAULT_APP" ]]; then
  APP="$DEFAULT_APP"
elif [[ -n "$TRIPLE_APP" ]]; then
  APP="$TRIPLE_APP"
else
  APP="$DEFAULT_APP"
fi
if [[ -z "${ADELPHA_VERSION:-}" ]]; then
  VERSION="$(python3 -c "import json; print(json.load(open(r'$ROOT/src-tauri/tauri.conf.json'))['version'])")"
else
  VERSION="$ADELPHA_VERSION"
fi
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) ARCH=aarch64 ;;
esac

if [[ ! -d "$APP" ]]; then
  echo "error: .app not found at $APP" >&2
  echo "Build it first with: CI=true npx tauri build --bundles app" >&2
  exit 1
fi

BUNDLE_ROOT="$(cd "$(dirname "$APP")/.." && pwd)"
OUT_DIR="${ADELPHA_DMG_DIR:-$BUNDLE_ROOT/dmg}"
DMG="${ADELPHA_DMG:-$OUT_DIR/Adelpha_${VERSION}_${ARCH}.dmg}"

mkdir -p "$OUT_DIR"

# Leftover create-dmg volumes / RW images block a later hdiutil run.
hdiutil info | awk -F: '/\/Volumes\/Adelpha/{print $1}' | while read -r dev; do
  [[ -n "$dev" ]] && hdiutil detach "$dev" -force >/dev/null 2>&1 || true
done
rm -f "$OUT_DIR"/rw.*.dmg "$DMG"

echo "Creating $DMG from $APP"
hdiutil create \
  -volname "Adelpha" \
  -srcfolder "$APP" \
  -ov \
  -format UDZO \
  "$DMG"
echo "Wrote $DMG"
