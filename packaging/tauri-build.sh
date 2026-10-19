#!/usr/bin/env bash
# Local/CI Tauri installer build. Loads src-tauri/updater.key when the
# environment does not already have TAURI_SIGNING_PRIVATE_KEY, so
# `npm run tauri:build` matches `make dist-current`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -z "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" && -f "$ROOT/src-tauri/updater.key" ]]; then
  echo "Signing updater artifacts from src-tauri/updater.key"
  export TAURI_SIGNING_PRIVATE_KEY_PATH="$ROOT/src-tauri/updater.key"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD-}"
fi

if [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" || -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]]; then
  exec env CI=true npx tauri build "$@"
fi

echo "No updater signing key; building without updater artifacts."
exec env CI=true npx tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}' "$@"
