# Digital Twin UI

**Full documentation** is a [Zensical](https://zensical.org/) site under `docs/`.

## Prerequisites

| Tool | Purpose |
| --- | --- |
| **Node.js 18+** (npm) | This Vite/React app |
| **[uv](https://docs.astral.sh/uv/)** | DTAM Python env + optional docs build |
| **DTAM** clone | Twin API + Agents API backends |

Suggested layout (sibling clones):

```text
~/dtam                 # backend (Twin API + ADK agents)
~/digital_twin_ui      # this GUI
```

## How the DTAM APIs must be on

This UI does **not** run Python or Gemini itself. It talks to two DTAM processes over HTTP. Start them from the **DTAM** repo (not this repo).

| Service | DTAM command | Bind | Required for |
| --- | --- | --- | --- |
| **Twin HTTP API** | `make twin-api` | `http://127.0.0.1:8080` | Telemetry, live dashboard, forecast, assess, sensors, console `status` / `sensors` |
| **Agents API** (ADK) | `make agents-api` | `http://127.0.0.1:8001` | Agents tab chat only |

### Twin API (required)

```bash
cd ../dtam          # or your DTAM clone path
uv sync             # once, if dependencies are not installed
make twin-api
```

Leave that terminal running. Verify:

```bash
curl -s http://127.0.0.1:8080/health
# expect: "status":"ok" and "connected":true

# OpenAPI UI
open http://127.0.0.1:8080/docs
```

Equivalent entrypoints: `uv run python -m dtam.api` or `uv run dtam-twin-api`.

Optional DTAM env (Twin API):

| Variable | Default | Purpose |
| --- | --- | --- |
| `DTAM_API_HOST` | `127.0.0.1` | Bind address |
| `DTAM_API_PORT` | `8080` | Port |
| `DTAM_SCANNER_ID` | `simulated_scanner` | Scanner profile |
| `DTAM_CORS_ORIGINS` | includes `:5173` / `:3000` | Needed only if the browser calls `:8080` directly |

### Agents API (optional — Agents tab)

```bash
cd ../dtam
# Google Gemini key must be available to the ADK process, e.g. in DTAM root .env:
#   GOOGLE_API_KEY=your_key_here
make agents-api
```

Leave that terminal running. The GUI proxies `/api/agents` → `:8001`. Without this process, telemetry still works; the Agents panel shows offline.

Do **not** confuse:

- `make twin-api` → Twin REST (`:8080`) — dashboards / telemetry  
- `make agents-api` → ADK `api_server` (`:8001`) — GUI chat  
- `make web` → ADK web UI on `:8001` (separate from this Vite app)

## Quick start (all pieces)

Use **three terminals** for the full stack (Twin + Agents + GUI):

```bash
# Terminal 1 — Twin API (required)
cd ../dtam && make twin-api
# → http://127.0.0.1:8080  ·  docs: http://127.0.0.1:8080/docs

# Terminal 2 — Agents API (optional, for Agents tab)
cd ../dtam && make agents-api
# → http://127.0.0.1:8001

# Terminal 3 — this GUI
cd ../digital_twin_ui
npm install
cp .env.example .env.local   # optional; defaults already use Vite proxies
npm run dev                  # http://localhost:5173/
```

Vite proxies (see `vite.config.ts`):

| Browser path | Backend |
| --- | --- |
| `/api/dtam/*` | `http://127.0.0.1:8080/*` |
| `/api/agents/*` | `http://127.0.0.1:8001/*` |

### Sanity checks in the UI

| Check | Expect |
| --- | --- |
| Header / console live dot | Green blink when Twin API is up |
| Side panels / live dashboard | Thermal, \(B_0\), EMI, RF update ~every 1.5 s |
| Agents tab | Online only if `make agents-api` is running with a valid `GOOGLE_API_KEY` |

## Documentation site

```bash
uv sync --group docs
make docs-serve   # preview
make docs         # strict build → site/
```

| Doc | Path |
| --- | --- |
| Home | [`docs/index.md`](docs/index.md) |
| How to run | [`docs/start/index.md`](docs/start/index.md) |
| Architecture | [`docs/guide/architecture.md`](docs/guide/architecture.md) |
| Twin + Agents APIs | [`docs/guide/twin-api.md`](docs/guide/twin-api.md) |
| Config | [`docs/guide/configuration.md`](docs/guide/configuration.md) |

## Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Vite dev server (+ proxies to `:8080` / `:8001`) |
| `npm run build` | Typecheck + production bundle |
| `npm run preview` | Preview production build |
| `npm run electron:dev` | Build UI then open Electron desktop shell |
| `npm run dist:mac` | Build macOS **DMG + ZIP** (Apple Silicon + Intel) → `release/` |
| `make docs` / `make docs-serve` | Zensical build / serve |

## macOS desktop app (shareable)

Package the GUI as a native Mac app with Electron (still talks to DTAM APIs on the machine that runs the app):

```bash
npm install
npm run dist:mac
```

Artifacts land in `release/`:

| File | Who it's for |
| --- | --- |
| `Adelpha Digital Twin-0.1.0-arm64.dmg` | Apple Silicon (M1/M2/M3/…) |
| `Adelpha Digital Twin-0.1.0.dmg` | Intel Macs |
| `*-mac.zip` | Same builds as zip (AirDrop / cloud share) |

### What your friends need

1. Install the `.dmg` (drag **Adelpha Digital Twin** into Applications).
2. On **first launch**, macOS may block an unsigned app: **Right-click → Open** (or System Settings → Privacy & Security → Open Anyway).
3. On the **same Mac**, start DTAM backends (the app proxies to loopback):

```bash
# In the DTAM repo
make twin-api      # required → :8080
make agents-api    # optional → :8001
```

Without `make twin-api`, the UI opens but stays disconnected.

Optional overrides when launching from a terminal:

```bash
DTAM_TWIN_URL=http://127.0.0.1:8080 DTAM_AGENTS_URL=http://127.0.0.1:8001 open -a "Adelpha Digital Twin"
```

### Local desktop smoke test (no DMG)

```bash
npm run electron:dev
```

## Stack

Vite · React · TypeScript · React Three Fiber · Zustand · Electron (desktop package) · Zensical (docs)

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Disconnected / red live dot | Twin API not running — start `make twin-api` in DTAM |
| Agents offline on `:8001` | Start `make agents-api`; ensure `GOOGLE_API_KEY` is in DTAM process env |
| CORS errors | Prefer default proxies (`VITE_DTAM_API_URL=/api/dtam`, `VITE_ADK_API_URL=/api/agents`); if calling APIs directly, allow `http://localhost:5173` in DTAM CORS |
| Port 5173 busy | Vite picks the next free port (`strictPort: false`) — use the URL printed in the terminal |
| “App can’t be opened” (Gatekeeper) | Unsigned build — Right-click the app → **Open** |
| Desktop app open but no data | DTAM Twin API must be on **that** Mac at `127.0.0.1:8080` |