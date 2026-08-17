---
icon: lucide/rocket
---

# Getting started

## Requirements

| Tool | Purpose |
| --- | --- |
| Node.js 18+ (npm) | This Vite app |
| [uv](https://docs.astral.sh/uv/) | DTAM Python env + optional docs toolchain |
| [DTAM](https://github.com/LeoMcBills/dtam) clone | Twin HTTP API + Agents API |

Typical layout:

``` text
~/dtam                 # Python twin + Twin API + ADK agents
~/digital_twin_ui      # this GUI
```

## How the DTAM APIs must be on

This repository is **front end only**. Telemetry and Agents chat require DTAM backends to be running in separate terminals.

| Service | Where | Command | URL | Needed for |
| --- | --- | --- | --- | --- |
| Twin HTTP API | DTAM repo | `make twin-api` | `http://127.0.0.1:8080` | **Required** — live dashboard, forecast, assess, sensors, console |
| Agents API (ADK) | DTAM repo | `make agents-api` | `http://127.0.0.1:8001` | **Optional** — Agents chat tab |

!!! important "Start APIs from DTAM"
    Always `cd` into your DTAM clone before `make twin-api` / `make agents-api`. Running those targets from `digital_twin_ui` will fail.

### 1. Twin API (required)

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
| `DTAM_API_PORT` | `8080` | Must match Vite proxy target |
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

### CORS note

This UI uses **same-origin Vite proxies** by default (`/api/dtam` → `:8080`, `/api/agents` → `:8001`), so the browser never needs CORS for those calls. If you set `VITE_DTAM_API_URL=http://127.0.0.1:8080` (direct), add your Vite origin to `DTAM_CORS_ORIGINS`.

## Install the GUI

```bash
cd digital_twin_ui
npm install
cp .env.example .env.local   # optional
```

Optional docs tools:

```bash
uv sync --group docs
```

## Run the GUI

With Twin API (and optionally Agents API) already up:

```bash
npm run dev
```

Vite listens on **5173** by default (`strictPort: false` — next free port if busy). Avoid assuming port **3000** when Grafana already binds `*:3000`.

| Check | Expect |
| --- | --- |
| Live indicator | Green blink when Twin API is reachable |
| System Context pill | Shows `scanner_id / mode` from health or state |
| Workspace switcher | **Digital Twin** by default; **⌘K** opens menu |
| Thermal / \(B_0\) / EMI / RF | Updating ~every 1.5 s (Digital Twin workspace) |
| Forecast | Predicted fields with `predicted` badges |
| Agents tab | Online only if `make agents-api` is running |
| Imaging Console | Switch workspace → three idle viewer panels + sequence editor |

Production build:

```bash
npm run build
npm run preview
```

!!! warning "Production preview"
    `npm run preview` does **not** include the Vite dev proxies. Point `VITE_*_API_URL` at reachable backends, or put a reverse proxy in front of the static `dist/` build.

## Docs site

```bash
make docs-serve   # live preview (Zensical)
make docs         # strict build → site/
```

See [Docs site](../project/docs-site.md).

## macOS desktop package

Build a shareable Mac app (DMG / ZIP) from this repo:

```bash
npm run dist:mac
# → release/Adelpha Digital Twin-0.1.0-arm64.dmg  (Apple Silicon)
# → release/Adelpha Digital Twin-0.1.0.dmg        (Intel)
```

The packaged app embeds a local static server + the same `/api/dtam` and `/api/agents` proxies as Vite. Recipients still need DTAM running locally:

```bash
cd ../dtam && make twin-api      # required
cd ../dtam && make agents-api    # optional
```

First open may require **Right-click → Open** because the build is unsigned (`identity: null`).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Red / disconnected indicator | Start `make twin-api` in DTAM; `curl http://127.0.0.1:8080/health` |
| Agents offline | Start `make agents-api`; set `GOOGLE_API_KEY` for that process |
| Empty panels but health OK | Check browser Network tab for `/api/dtam/twin/state` |
| Wrong port in browser | Use the URL Vite prints (may not be 5173) |
| Gatekeeper blocks the `.app` | Right-click → Open (unsigned local build) |