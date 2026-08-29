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

## In-app updates (Settings → Updates)

Packaged Adelpha checks GitHub Releases for a newer signed build:

`https://github.com/imr-framework/digital_twin_ui/releases/latest/download/latest.json`

Settings → **Check for updates** uses that feed. **Automatic updates**
(off by default) checks about 12 seconds after launch, then downloads,
installs, and relaunches when a newer version is published.

The public minisign key is already in `src-tauri/tauri.conf.json`
(`plugins.updater.pubkey`). The matching **private** key must never be
committed. It lives locally as `src-tauri/updater.key` (gitignored) and
in GitHub Actions as secrets.

Losing the private key permanently bricks in-app updates for every
install that already has this public key. Keep an offline backup.

### GitHub Actions secrets

| Secret | Purpose |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Full contents of `src-tauri/updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for that key (empty string if unencrypted) |

If those secrets are missing, CI still builds installers but skips
updater signatures (`createUpdaterArtifacts: false`). Pull requests
should stay in that mode. Tag releases that should feed Settings must
have the secrets configured.

### Publishing a version the app can install

1. Bump `version` in `src-tauri/tauri.conf.json` (and matching
   `package.json` / `Cargo.toml` if you keep them in lockstep) **above**
   whatever is already installed. `0.1.0` will not see an update until
   a later version is on GitHub Latest.
2. Push a tag `vX.Y.Z` (example: `v0.2.0`).
3. The `desktop.yml` workflow builds each platform, then the
   `publish-updater` job writes `latest.json` and uploads artifacts to
   that GitHub Release.

`latest.json` is assembled by `packaging/updater/assemble_latest_json.py`
from:

| Platform key | Artifact |
| --- | --- |
| `darwin-aarch64` | `Adelpha-darwin-aarch64.app.tar.gz` + `.sig` |
| `darwin-x86_64` | `Adelpha-darwin-x86_64.app.tar.gz` + `.sig` |
| `windows-x86_64` | NSIS `*setup.exe` + `.sig` |
| `linux-x86_64` | AppImage + `.sig` |

Platforms without a matching `.sig` are omitted. The updater plugin
rejects a feed that lists a platform with an empty URL.

Local `make dist-current` signs updater artifacts when
`src-tauri/updater.key` or `TAURI_SIGNING_PRIVATE_KEY` is present;
otherwise it builds without them. Apple Developer ID / Authenticode
(the tables above) are separate from this minisign key: Gatekeeper
trusts the OS signature; Settings trusts the updater signature.
