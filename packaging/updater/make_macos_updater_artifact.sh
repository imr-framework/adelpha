#!/usr/bin/env bash
# Build and sign Adelpha.app.tar.gz for the in-app updater.
#
# Tauri writes this tarball after a successful bundle. Apple codesign often
# fails in CI before that step, and the unsigned .app retry / hdiutil wrap
# never creates it — so latest.json ships without darwin-* platforms.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$(find "$ROOT/src-tauri/target" -path "*/bundle/macos/Adelpha.app" -type d 2>/dev/null | head -n 1 || true)"

if [[ -z "$APP" || ! -d "$APP" ]]; then
  echo "make_macos_updater_artifact: no Adelpha.app under src-tauri/target; skipping"
  exit 0
fi

BUNDLE_DIR="$(cd "$(dirname "$APP")" && pwd)"
TAR_GZ="$BUNDLE_DIR/Adelpha.app.tar.gz"

if [[ ! -f "$TAR_GZ" ]]; then
  echo "Creating $TAR_GZ from $APP"
  COPYFILE_DISABLE=1 tar -C "$BUNDLE_DIR" -czf "$TAR_GZ" Adelpha.app
fi

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  echo "No TAURI_SIGNING_PRIVATE_KEY; left unsigned $TAR_GZ"
  exit 0
fi

if [[ -f "${TAR_GZ}.sig" ]]; then
  echo "Updater signature already present: ${TAR_GZ}.sig"
  exit 0
fi

echo "Signing $TAR_GZ"
(cd "$ROOT" && npx tauri signer sign "$TAR_GZ")
echo "Wrote ${TAR_GZ}.sig"
