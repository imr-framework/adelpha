# Adelpha desktop packaging (Tauri v2)

Adelpha’s production shell is **Tauri v2**. The React/Vite frontend is unchanged.
A single Python sidecar, `adelpha-python-runtime`, owns every Python API.

Electron remains in the tree until Tauri feature parity is verified on a
platform installer. It is not used by the Tauri production bundle.

## Architecture

```text
React (Vite)
    ↓  invoke / fetch + session token
Tauri / Rust  (window, PTY, paths, sidecar lifecycle)
    ↓  stdout handshake
Python supervisor  (one executable)
    ├── gateway  http://127.0.0.1:<dynamic>/
    ├── twin     /api/dtam/*     (always)
    ├── console  /api/mri/*      (always)
    └── agents   /api/agents/*   (lazy; needs user API key)
```

The frontend never hard-codes service ports. Tauri injects the supervisor
base URL and an ephemeral session token at launch.

## Developer commands

| Task | Command |
| --- | --- |
| Install development dependencies | `make install` |
| Run Tauri in development | `make tauri-dev` / `npm run tauri:dev` |
| Build the Python sidecar | `make sidecar` / `npm run sidecar:build` |
| Build the current-platform installer | `make dist-current` |
| Wrap an existing `.app` into a DMG | `make dmg` |
| Run supervisor tests | `make test-runtime` |
| Clean docs/Vite output | `make clean` |
| Clean packaging artifacts only | `make clean-packaging` |

Development mode (`tauri dev`) prefers `dtam/.venv` when present, otherwise
`runtime/python/.venv`, and runs `python -m adelpha_runtime`. Production
installs use only the PyInstaller onedir copied to `src-tauri/resources/python-runtime/`
and remapped in the app bundle to `$RESOURCE/python-runtime/`. If the DMG step
fails on macOS (`bundle_dmg.sh` / Finder AppleScript), the `.app` is still
valid; run `make dmg` to wrap it with `hdiutil` (version comes from
`tauri.conf.json`).

The packaged WebView CSP allows `blob:` (imported CAD), `wasm-unsafe-eval`
(STEP tessellation and MediaPipe), and `mediastream:` (camera). MediaPipe WASM
is copied from `node_modules` into `public/mediapipe/wasm` at Vite start (gitignored)
and shipped in `dist/`. macOS hardened runtime includes the **camera** and
**network.client** entitlements. See [Signing](signing.md).

Vite-only `npm run dev` still proxies `/api/*` to the classic fixed ports
for browser work. Electron scripts remain for comparison until parity is
signed off.

## Decisions from the repository audit

| Topic | Finding | Choice |
| --- | --- | --- |
| Twin API | `dtam.api` FastAPI on :8080 (`python -m dtam.api`) | Mount at `/api/dtam` in the supervisor |
| Agents | Separate Google ADK `api_server` on :8001 | Lazy child process; gateway reverse-proxies `/api/agents` |
| Imaging console | `python -m services.api` on :8002 | Mount at `/api/mri` |
| Electron | Loopback static server + `/api/*` proxy + `node-pty` | Tauri webview + supervisor gateway + Rust PTY |
| Numpy | DTAM wants numpy 2; MRI4ALL pins numpy 1.25 + numba | One sidecar uses numpy 2; console HTTP façade does not import numba at boot |
| Torch / PINN | Optional extra | Not in the default sidecar |
| PyQt5 / `run_ui.py` | Legacy Qt UI | Not bundled |
| FPGA / `marcos_extras` bitstreams | Red Pitaya deployment | Excluded from the desktop sidecar |
| `marcos_server` C++ | Scanner/server runtime | Excluded |
| `marcos_client` | Used by acq workers | Available to lazy acq; not a public HTTP service |
| HalbachMRIDesigner | GPL-3 vendor clone | Not bundled |
| DTAM | Regular tree at `dtam/` | Sidecar build reads `dtam/src` |
| Secrets | Local `dtam/.env` must never ship | User pastes `GOOGLE_API_KEY` in app config (`<config>/google_api_key`) |
| Sidecar packager | PyInstaller vs Nuitka | **PyInstaller onedir**. Safer for scipy, numpy, and ADK native libs. |

## Service registry

| ID | Required | Policy | Health |
| --- | --- | --- | --- |
| `twin` | yes | always | `GET /api/dtam/health` |
| `console` | yes | always | `GET /api/mri/health` |
| `agents` | no | lazy | `GET /api/agents/list-apps` |

Adding a future Python integration: see
[`adding-a-service.md`](adding-a-service.md).

## Runtime paths

| Kind | Location |
| --- | --- |
| Bundled resources | Read-only app/resource directory (never write) |
| User config | Tauri `app_config_dir` |
| MRI / acquired data | `app_data_dir/mri4all` unless the user configures another data directory |
| Logs | Tauri `app_log_dir` |
| Cache / temp | Tauri cache + temp directories |

First launch copies DTAM default configs into the user config directory when
present and creates `mri4all/{config,data,logs}`. Existing Electron-era
`adelpha/.mri4all` data is **not** deleted. If you previously used
`~/Library/Application Support/Adelpha` there is nothing to migrate yet;
copy `.mri4all` into the new data directory if you need those studies.

## Security

- Gateway binds `127.0.0.1` only.
- Port is ephemeral; advertised in the `ADELPHA_RUNTIME_READY` handshake.
- Per-session bearer token on HTTP and WebSocket (`?token=`).
- CORS limited to the Tauri origin and local Vite origins.
- Frontend cannot execute a shell; the in-app terminal is a typed PTY on the
  Rust side (same user-facing behavior as Electron `node-pty`).
- No `.env` files, API keys, or certificates are bundled.

## What this machine can verify

This checkout is **macOS**. The Python supervisor, unit tests, and a local
Tauri debug run can be smoke-tested here. Windows NSIS and Linux deb/AppImage
are configured and built in CI on native runners. Those artifacts are not
claimed to work until that CI job has produced and smoke-tested them.

Do not cross-compile the Python sidecar.

## Related documents

- [Excluded assets](exclusions.md)
- [Electron migration](electron-migration.md)
- [Signing, notarization, and in-app updates](signing.md)
- [Adding a Python service](adding-a-service.md)
- [Known limitations](limitations.md)

## Licensing (read before distributing)

- Adelpha GUI: MIT (`LICENSE`)
- Imaging console (`console/`): GPL-3. Bundling it in the sidecar makes the
  **distributed Python runtime** a GPL-3 work. Ship corresponding source.
- DTAM (`dtam/LICENSE`): MIT
- FLOCRA interpreter: MIT
- HalbachMRIDesigner: GPL-3; not bundled
