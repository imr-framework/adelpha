#!/usr/bin/env bash
# Wrap the already-bundled .app with hdiutil. Used when Tauri's create-dmg
# AppleScript/codesign step fails (common in CI and headless sessions).
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

detach_adelpha_volumes() {
  hdiutil info 2>/dev/null | awk '/\/Volumes\/Adelpha/{print $1}' | while read -r dev; do
    [[ -n "$dev" ]] && hdiutil detach "$dev" -force >/dev/null 2>&1 || true
  done
  shopt -s nullglob
  for vol in /Volumes/Adelpha /Volumes/Adelpha*; do
    hdiutil detach "$vol" -force >/dev/null 2>&1 || true
  done
  shopt -u nullglob
}

mkdir -p "$OUT_DIR"
detach_adelpha_volumes
rm -f "$OUT_DIR"/rw.*.dmg "$DMG"

# Stage outside target/: a half-finished Tauri DMG often leaves the bundle
# tree busy (hdiutil: create failed - Resource busy). Use /tmp, not TMPDIR
# under the workspace.
STAGE="$(mktemp -d "/tmp/adelpha-dmg.XXXXXX")"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

VOL="$STAGE/vol"
mkdir -p "$VOL"
ditto "$APP" "$VOL/Adelpha.app"
ln -s /Applications "$VOL/Applications"
sync

echo "Creating $DMG from $VOL/Adelpha.app"
ok=0
for attempt in 1 2 3 4 5; do
  detach_adelpha_volumes
  rm -f "$STAGE/Adelpha.dmg"
  if hdiutil create \
    -volname "Adelpha" \
    -srcfolder "$VOL" \
    -ov \
    -format UDZO \
    "$STAGE/Adelpha.dmg"
  then
    ok=1
    break
  fi
  echo "hdiutil attempt $attempt failed; retrying..." >&2
  sleep $((attempt * 2))
done

if [[ "$ok" -ne 1 ]]; then
  echo "error: hdiutil could not create the DMG" >&2
  exit 1
fi

mv -f "$STAGE/Adelpha.dmg" "$DMG"
echo "Wrote $DMG"
