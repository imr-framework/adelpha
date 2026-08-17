---
icon: lucide/monitor
---

# Digital Twin UI

**Adelpha observer GUI** for [DTAM](https://github.com/LeoMcBills/dtam) (Digital Twin Architecture for MRI). The browser does not import Python twin code or Gemini SDKs — it polls the Twin HTTP API and (optionally) the Agents API, then renders live thermal, \(B_0\), EMI, and RF state across **three workspaces**: Digital Twin, Imaging Console, and Engineering Studio.

!!! tip "Companion backends"
    This repo is Vite + React only. You must run DTAM services separately:

    - **Twin API** — `make twin-api` → `http://127.0.0.1:8080` (**required**)
    - **Agents API** — `make agents-api` → `http://127.0.0.1:8001` (optional, Agents tab)

## What you get

| Surface | Role |
| --- | --- |
| **Top bar** | Adelpha brand · **System Context** (`scanner / mode`) · **workspace switcher** · Settings · Menu |
| **Digital Twin** | 3D magnet viewport, tool rail, telemetry side panel, live dashboard, logging + terminal |
| **Imaging Console** | Three-screen viewer tier + sequence list + parameter tabs (operator-style shell) |
| **Engineering Studio** | Placeholder for future engineering tools |
| **Agents** | Markdown chat, model picker, image attachments, forecast plots from tool artifacts |
| **Camera / head motion** | MediaPipe face mesh, nose tracker, motion log export + share-to-agent |
| **Launch intro** | Cinematic Adelpha intro once per browser session |

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

Use **⌘K** to open the workspace switcher. Press `?replayIntro=1` on the URL to replay the launch animation.

Preview this documentation:

```bash
uv sync --group docs
make docs-serve
```

## Stack

- **Vite** + React 18 + TypeScript
- **React Three Fiber** / drei / three — magnet scene
- **MediaPipe Tasks Vision** — camera head-pose tracking
- **xterm.js** — terminal (browser builtins; real shell in Electron)
- **Zustand** — twin state, head motion, console prefs
- **Electron** — macOS desktop package (`npm run dist:mac`)
- **Zensical** — this docs site

## Where to go next

| Page | Contents |
| --- | --- |
| [Getting started](start/index.md) | Prerequisites, **exact API startup**, verify health |
| [Workspaces](guide/workspaces.md) | Digital Twin · Imaging Console · Engineering Studio |
| [Architecture](guide/architecture.md) | Data flow GUI ↔ Twin / Agents APIs |
| [Twin API](guide/twin-api.md) | Endpoints + Agents API contract |
| [Dashboard](guide/dashboard.md) | Panels, viewport tools, Agents, terminal, camera |
| [Configuration](guide/configuration.md) | Env vars, proxies, CAD mesh, persisted prefs |
| [Docs site](project/docs-site.md) | Building with Zensical |
