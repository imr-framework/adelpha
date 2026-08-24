---
icon: lucide/rocket
---

# Getting started

## Requirements

| Tool | Purpose |
| --- | --- |
| Node.js 18+ (npm) | This Vite + Electron app |
| Python 3.10+ | MRI console API (`console/`) |
| [uv](https://docs.astral.sh/uv/) | DTAM Python env + optional docs toolchain |
| [DTAM](https://github.com/imr-framework/dtam) clone | Twin HTTP API + Agents API |

Typical layout:

``` text
~/dtam                 # Python twin + Twin API + ADK agents
~/adelpha              # this GUI + MRI console façade
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

With the APIs you need already up:

=== "Electron (typical)"

    ```bash
    npm run electron:dev
    ```

    This runs a **production Vite build** then opens Electron. CSS/TS changes are not hot-reloaded — restart after edits.

=== "Browser (HMR)"

    ```bash
    npm run dev
    ```

    Vite listens on **5173** by default (`strictPort: false` — next free port if busy). Avoid assuming port **3000** when Grafana already binds `*:3000`.

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
# → release/Adelpha Digital Twin-0.1.0-arm64.dmg  (Apple Silicon)
# → release/Adelpha Digital Twin-0.1.0.dmg        (Intel)
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
| Red / disconnected indicator | Start `make twin-api` in DTAM; `curl http://127.0.0.1:8080/health` |
| Agents offline | Start `make agents-api`; set `GOOGLE_API_KEY` for that process |
| Imaging Console errors / empty queue | Start `python -m services.api` from `console/`; `curl http://127.0.0.1:8002/health` |
| Exam disappeared | API restart clears in-memory exam — register again |
| Electron UI looks stale | Restart `npm run electron:dev` after code changes |
| Empty twin panels but health OK | Check Network tab for `/api/dtam/twin/state` |
| Wrong port in browser | Use the URL Vite prints (may not be 5173) |
| Terminal has no shell | `npx electron-rebuild -f -w node-pty` |
| Gatekeeper blocks the `.app` | Right-click → Open (unsigned local build) |
