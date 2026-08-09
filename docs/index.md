---
icon: lucide/monitor
---

# Digital Twin UI

**Observer GUI** for [DTAM](https://github.com/LeoMcBills/dtam) (Digital Twin Architecture for MRI). The browser does not import Python twin code or Gemini SDKs — it polls the Twin HTTP API and (optionally) the Agents API, then renders live thermal, \(B_0\), EMI, and RF state next to a 3D magnet view, console, and Agents chat.

!!! tip "Companion backends"
    This repo is Vite + React only. You must run DTAM services separately:

    - **Twin API** — `make twin-api` → `http://127.0.0.1:8080` (**required**)
    - **Agents API** — `make agents-api` → `http://127.0.0.1:8001` (optional, Agents tab)

## What you get

| Surface | Role |
| --- | --- |
| Header | Connection badge, `scanner_id`, mode, `twin_version`, last timestamp |
| Side panel | Telemetry · Agents · forecast · notes · raw sensors · CAD view |
| 3D viewport | CAD magnet (optional STL) + tool rail (magnet / EMI / RF / camera / gradient) |
| Live dashboard | Overlay charts for temperature / noise |
| Console | Logging + Terminal (`help`, `status`, `sensors`, …) |

Provenance is first-class: every quantity shows `measured` / `estimated` / `predicted` / `nominal`. Predicted fields appear only after a forecast request.

## Quick start

```bash
# Terminal 1 — Twin API (required)
cd ../dtam && make twin-api

# Terminal 2 — Agents API (optional)
cd ../dtam && make agents-api

# Terminal 3 — this UI
npm install
npm run dev
```

Open the Vite URL (default **http://localhost:5173/**). Dev proxies:

- `/api/dtam/*` → Twin API `:8080`
- `/api/agents/*` → Agents API `:8001`

Preview this documentation:

```bash
uv sync --group docs
make docs-serve
```

## Stack

- **Vite** + React 18 + TypeScript
- **React Three Fiber** / drei / three — magnet scene
- **Zustand** — twin state + view prefs
- **Zensical** — this docs site

## Where to go next

| Page | Contents |
| --- | --- |
| [Getting started](start/index.md) | Prerequisites, **exact API startup**, verify health |
| [Architecture](guide/architecture.md) | Data flow GUI ↔ Twin / Agents APIs |
| [Twin API](guide/twin-api.md) | Endpoints + Agents API contract |
| [Dashboard](guide/dashboard.md) | Panels, forecast, Agents tab |
| [Configuration](guide/configuration.md) | Env vars, proxies, CAD mesh |
| [Docs site](project/docs-site.md) | Building with Zensical |
