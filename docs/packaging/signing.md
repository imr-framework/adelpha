# Signing, notarization, and trusted public releases

CI produces **unsigned** artifacts unless the secrets below are present.
Unsigned macOS builds will be blocked by Gatekeeper; Windows SmartScreen
may warn; Linux packages still install.

Do not commit certificates, `.p12` files, or API keys.

## macOS (Apple Silicon and Intel, native runners)

Required for a Gatekeeper-trusted DMG:

1. Developer ID Application certificate (`.p12`) and password.
2. Apple ID (or App Store Connect API) for notarization.
3. Hardened runtime is enabled in `tauri.conf.json`.
4. Sign the **sidecar onedir** (`adelpha-python-runtime` and native `.so/.dylib`
   under `_internal/`) with the same Developer ID before bundling, or Tauri
   will ship an unsigned helper and Gatekeeper will fail.

GitHub Actions secrets (names only):

| Secret | Purpose |
| --- | --- |
| `APPLE_CERTIFICATE` | Base64 `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Certificate password |
| `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | Notarytool |
| `APPLE_API_KEY` / `APPLE_API_ISSUER` | Alternative to Apple ID |

Tauri env: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`.

Intel DMG is built on `macos-13` (x86_64). A universal DMG is **not** produced:
the Python sidecar cannot be assumed universal.

## Windows (x64 NSIS)

| Secret | Purpose |
| --- | --- |
| `WINDOWS_CERTIFICATE` | Base64 Authenticode `.pfx` |
| `WINDOWS_CERTIFICATE_PASSWORD` | PFX password |

Tauri: `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`.
ARM64 Windows is not in the default matrix (native deps unproven).

WebView2: the NSIS installer uses Tauri’s download bootstrapper when the
runtime is missing.

## Linux

`.deb` and AppImage are not code-signed in this repo. Distribute checksums
(`SHA256SUMS`) from CI. Hardware access for a future MaRCoS USB/network
device may need udev rules installed by the user — not by a silent postinst
that programs FPGAs.

## Updater

`tauri.conf.json` is updater-ready (identity + version) but no updater
endpoint or public key is configured yet. Add `plugins.updater` and
`TAURI_SIGNING_PRIVATE_KEY` when you ship auto-update.
