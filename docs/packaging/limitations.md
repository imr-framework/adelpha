# Known limitations

- **DTAM** is MIT (`dtam/LICENSE`). A public installer that also bundles the
  imaging console is still a GPL-3 distribution of that runtime.
- **GPL-3 console** in the sidecar: corresponding source must ship with any
  distributed runtime.
- **DTAM gitlink**: this repo records `dtam` as commit `160000`, not a normal
  tree. CI clones DTAM when `dtam/src` is missing. Confirm the remote
  (`https://github.com/imr-framework/dtam`) matches the lab’s canonical repo.
- **Numpy**: sidecar is numpy 2. Sequence registry code that needs numba 1.x
  will use the HTTP FALLBACK catalog.
- **Agents** require a user-provided `GOOGLE_API_KEY` in the app config
  directory (`google_api_key`). The key is never bundled. Rotate any key that
  lived in a developer `dtam/.env`.
- **No cross-compilation** of the Python sidecar. Each installer is built on
  a matching OS/arch runner.
- **Universal macOS DMG** is not produced (sidecar native libs).
- **macOS `bundle_dmg.sh`** uses Finder AppleScript for icon layout. That step
  often fails in CI, Cursor terminals, or when a leftover Adelpha volume is
  still mounted. `make dist-current` sets `CI=true` (skip AppleScript) and
  falls back to `make dmg` (`hdiutil`) if Tauri's DMG still fails. The `.app`
  under `src-tauri/target/release/bundle/macos/` is usable without a DMG.
- **Windows ARM64** and extra Linux arches are out of the default matrix.
- **MaRCoS / FPGA**: desktop never programs hardware. Scanner deploy stays a
  separate, user-controlled workflow.
- **Electron** is still in the source tree for comparison; it is not in the
  Tauri installer.
- **Signing**: public Gatekeeper/SmartScreen trust needs certificates listed
  in [`signing.md`](signing.md). CI defaults to unsigned artifacts.
- **In-app updates**: Settings → Updates only installs a newer build after a
  **tagged** CI release (`v*`) that uploaded signed updater artifacts and
  `latest.json`. Dev / unsigned local builds will report an error or “up to
  date” rather than installing from GitHub.
- **In-app terminal** is a real user shell (PTY), matching Electron. It is
  implemented in Rust only — the frontend cannot pass arbitrary OS commands
  through a generic shell API.
