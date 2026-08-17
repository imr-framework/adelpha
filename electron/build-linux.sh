#!/usr/bin/env bash
# Build Ubuntu AppImage + .deb. On macOS this must run in Linux Docker so
# node-pty compiles as ELF rather than shipping the Darwin helper.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${ELECTRON_BUILDER_IMAGE:-electronuserland/builder:20}"

if [[ "$(uname -s)" == "Linux" ]]; then
  exec npx electron-builder --linux --x64
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Linux packages need Docker on macOS (node-pty must be compiled for Linux)." >&2
  exit 1
fi

docker run --rm \
  --platform linux/amd64 \
  -v "$ROOT":/project \
  -v adelpha-linux-nm:/project/node_modules \
  -v adelpha-eb-cache:/root/.cache \
  -w /project \
  -e CSC_IDENTITY_AUTO_DISCOVERY=false \
  -e ELECTRON_CACHE=/root/.cache/electron \
  -e ELECTRON_BUILDER_CACHE=/root/.cache/electron-builder \
  "$IMAGE" \
  bash -lc 'npm ci && npx electron-builder --linux --x64'
