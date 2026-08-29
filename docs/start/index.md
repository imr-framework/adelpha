---
icon: lucide/rocket
---

# Getting started

## Requirements

| Tool | Purpose |
| --- | --- |
| Node.js 18+ (npm) | Vite frontend + Tauri CLI |
| Rust (stable) | Tauri desktop shell |
| Python 3.10–3.12 | Supervisor (`adelpha_runtime`) and sidecar freeze |
| [uv](https://docs.astral.sh/uv/) | Optional docs toolchain |
| DTAM (this repo, `dtam/`) | Twin + Agents (bundled in production) |

Typical layout:

``` text
~/adelpha              # GUI + MRI console façade
~/adelpha/dtam         # Python twin + Twin API + ADK agents
```

## Backends

Telemetry, Agents chat, and the Imaging Console each need their own process.

| Service | Where | Command | URL | Needed for |
| --- | --- | --- | --- | --- |
| Twin HTTP API | DTAM repo | `make twin-api` | `http://127.0.0.1:8080` | **Required** for Digital Twin telemetry |
| Agents API (ADK) | DTAM repo | `make agents-api` | `http://127.0.0.1:8001` | **Optional** — Agents chat tab |
| MRI console API | `adelpha/console` | `python -m services.api` | `http://127.0.0.1:8002` | **Required** for Imaging Console |

!!! important "Start APIs from the right repo"
    Always `cd` into your **DTAM** clone before `make twin-api` / `make agents-api`. Always `cd` into **`adelpha/console`** before `python -m services.api`.

### 1. Twin API (required for Digital Twin)

```bash
cd ../dtam
uv sync                 # once
make twin-api
# → http://127.0.0.1:8080
# → OpenAPI: http://127.0.0.1:8080/docs
```

Keep this process running. Equivalent:

```bash
uv run python -m dtam.api
# or
uv run dtam-twin-api
```

Health check:

```bash
curl -s http://127.0.0.1:8080/health
```

``` json
{
  "status": "ok",
  "scanner_id": "simulated_scanner",
  "mode": "simulation",
  "connected": true
}
```

| DTAM env (Twin API) | Default | Notes |
| --- | --- | --- |
| `DTAM_API_HOST` | `127.0.0.1` | Bind address |
| `DTAM_API_PORT` | `8080` | Must match Vite/Electron proxy target |
| `DTAM_SCANNER_ID` | `simulated_scanner` | Adapter profile |
| `DTAM_CORS_ORIGINS` | includes Vite `:5173` | Only needed for direct browser→`:8080` calls |

### 2. Agents API (optional)

For the **Agents** panel:

```bash
cd ../dtam
# ADK needs a Gemini key in the process environment, e.g. DTAM root `.env`:
#   GOOGLE_API_KEY=...
make agents-api
# → http://127.0.0.1:8001
```

!!! note "API key"
    Nested `src/dtam/agents/**/.env` files are not always loaded by `make agents-api`. Prefer `GOOGLE_API_KEY` in the DTAM **repo root** `.env` or your shell before starting the server.

Do not mix up:

| Command | Port | Role |
| --- | --- | --- |
| `make twin-api` | 8080 | Twin REST for GUIs |
| `make agents-api` | 8001 | ADK API server for GUI chat |
| `make web` | 8001 | ADK’s own web UI (not this app) |
| `python -m services.api` | 8002 | Adelpha MRI console façade |

### 3. MRI console API (required for Imaging Console)

```bash
cd console
python -m services.api
# → http://127.0.0.1:8002
```

Use a Python environment with `console/requirements.txt` (full MRI4ALL stack) or `console/services/api/requirements.txt` (façade-only).

If `/opt/mri4all` is missing or not writable, the API writes to **`adelpha/.mri4all/`**. Restarting the API **clears the in-memory exam** — you must register again.

```bash
curl -s http://127.0.0.1:8002/health
```

See [Imaging Console](../guide/imaging-console.md).

### CORS note

This UI uses **same-origin proxies** by default (`/api/dtam` → `:8080`, `/api/agents` → `:8001`, `/api/mri` → `:8002`), so the browser never needs CORS for those calls. If you set `VITE_DTAM_API_URL=http://127.0.0.1:8080` (direct), add your Vite origin to `DTAM_CORS_ORIGINS`.

## Install the GUI

```bash
cd adelpha
npm install
```

Optional docs tools:

```bash
uv sync --group docs
```

## Run the GUI

=== "Tauri (production shell)"

    ```bash
    make tauri-dev
    ```

    Vite HMR plus the Rust shell. The Python supervisor starts as `python3 -m adelpha_runtime` in development when the sidecar binary is not present.

=== "Browser (HMR only)"

    ```bash
    npm run dev
    ```

    Vite listens on **5173** (`strictPort: true` for Tauri). Start Twin / Agents / MRI APIs yourself; the in-app terminal has no real shell.

=== "Electron (legacy)"

    ```bash
    npm run electron:dev
    ```

    Production Vite build then Electron. Kept until Tauri installer parity is signed off.

| Check | Expect |
| --- | --- |
| Live indicator | Green blink when Twin API is reachable |
| System Context pill | Shows `scanner_id / mode` from health or state |
| Workspace switcher | Last workspace or **Settings → Workspace** startup; **⌘K** opens menu |
| Thermal / \(B_0\) / EMI / RF | Updating ~every 1.5 s (Digital Twin workspace) |
| Forecast | Predicted fields with `predicted` badges |
| Agents tab | Online only if `make agents-api` is running |
| Imaging Console | Registration, sequence queue, Study Viewer, Status, logs — needs MRI API |

Production preview (static `dist/` without Electron):

```bash
npm run build
npm run preview
```

!!! warning "Production preview"
    `npm run preview` does **not** include the Vite dev proxies. Point `VITE_*_API_URL` at reachable backends, or put a reverse proxy in front of `dist/`.

## Docs site

```bash
make docs-serve   # live preview (Zensical)
make docs         # strict build → site/
```

See [Docs site](../project/docs-site.md).

## Desktop packages

```bash
npm run dist:mac
# → release/Adelpha-0.1.0-arm64.dmg  (Apple Silicon)
# → release/Adelpha-0.1.0.dmg        (Intel)
npm run dist:win
npm run dist:linux
```

The packaged app embeds a local static server and the same `/api/dtam`, `/api/agents`, and `/api/mri` proxies. Recipients still need backends running locally:

```bash
cd ../dtam && make twin-api           # Digital Twin
cd ../dtam && make agents-api         # optional
cd adelpha/console && python -m services.api   # Imaging Console
```

First open on macOS may require **Right-click → Open** because the build is unsigned (`identity: null`).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Red / disconnected (Tauri) | Export diagnostics; check `<app-log>/supervisor.log` |
| Red / disconnected (Vite/Electron) | Start `make twin-api` in DTAM; `curl http://127.0.0.1:8080/health` |
| Agents offline | User config `google_api_key`, or `make agents-api` in Vite mode |
| Imaging Console errors / empty queue | Supervisor must mount console; Vite mode: `python -m services.api` from `console/` |
| Exam disappeared | API restart clears in-memory exam — register again |
| Electron UI looks stale | Restart `npm run electron:dev` after code changes |
| Empty twin panels but health OK | Check Network tab for `/api/dtam/twin/state` |
| Terminal has no shell | Use `make tauri-dev` (or legacy Electron), not the browser |
| Gatekeeper blocks the `.app` | Unsigned local build — see [signing](../packaging/signing.md) |
