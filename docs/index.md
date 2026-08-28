---
icon: lucide/monitor
---

<p align="center">
  <img class="adelpha-hero-logo" src="assets/adelpha-logo.svg" alt="Adelpha" width="220" />
</p>

# Adelpha

**Adelpha** is the Intelligent Magnetic Resonance Framework: a Tauri/React observer GUI for [DTAM](https://github.com/imr-framework/dtam) and an **Imaging Console** over a local MRI4ALL FastAPI façade. Production builds talk to a bundled Python supervisor (`/api/dtam`, `/api/agents`, `/api/mri`). Developers can still run those APIs as separate processes for Vite/Electron. Three workspaces: Digital Twin, Imaging Console, and Engineering Studio.

!!! tip "Production vs development backends"
    Packaged Adelpha starts the Python supervisor itself — see [Desktop packaging](packaging/index.md).

    For `npm run dev` / Electron, run these separately:

    - **Twin API** — `make twin-api` in DTAM → `http://127.0.0.1:8080` (**required** for live telemetry)
    - **Agents API** — `make agents-api` in DTAM → `http://127.0.0.1:8001` (optional, Agents tab)
    - **MRI console API** — `python -m services.api` from `console/` → `http://127.0.0.1:8002` (**required** for Imaging Console)

## What you get

| Surface | Role |
| --- | --- |
| **Top bar** | Adelpha brand · **System Context** (`scanner / mode`) · **workspace switcher** · Settings · Menu |
| **Digital Twin** | 3D magnet viewport, tool rail, telemetry side panel, live dashboard, logging + terminal |
| **Imaging Console** | Operator console: registration, sequence queue, Study Viewer, Status, logs, configuration |
| **Engineering Studio** | Placeholder for future engineering tools |
| **Agents** | Markdown chat, model picker, image attachments, forecast plots from tool artifacts |
| **Camera / head motion** | MediaPipe face mesh, nose tracker, motion log export + share-to-agent |
| **Launch intro** | Cinematic Adelpha intro once per browser session |

Provenance is first-class: every quantity shows `measured` / `estimated` / `predicted` / `nominal`. Predicted fields appear only after a forecast request. Software version shown in the console is Adelpha **0.1.0**.

## Quick start

```bash
# Terminal 1 — Twin API (required for Digital Twin)
cd ../dtam && make twin-api

# Terminal 2 — Agents API (optional)
cd ../dtam && make agents-api

# Terminal 3 — MRI console API (required for Imaging Console)
cd console && python -m services.api

# Terminal 4 — this UI
npm install
make tauri-dev          # Vite HMR + Tauri + Python supervisor
# or: npm run dev       # browser only; start APIs yourself
# or: npm run electron:dev  # legacy Electron
```

Tauri injects one supervisor origin (no fixed ports). Vite/Electron still proxy:

- `/api/dtam/*` → Twin API `:8080`
- `/api/agents/*` → Agents API `:8001`
- `/api/mri/*` → MRI console API `:8002`

Use **⌘K** to open the workspace switcher. Press `?replayIntro=1` on the URL to replay the launch animation.

Preview this documentation:

```bash
uv sync --group docs
make docs-serve
```

## Stack

- **Vite** + React 18 + TypeScript
- **Tauri v2** — production desktop shell (`make tauri-dev`, `make dist-current`)
- **Electron** — legacy shell until installer parity is signed off
- **React Three Fiber** / drei / three — magnet scene
- **MediaPipe Tasks Vision** — camera head-pose tracking
- **xterm.js** — terminal (browser builtins; real shell in Tauri/Electron)
- **Zustand** — twin state, head motion, console prefs
- **Python supervisor** — FastAPI gateway + DTAM + MRI façade + optional ADK
- **Zensical** — this docs site

## Where to go next

| Page | Contents |
| --- | --- |
| [Getting started](start/index.md) | Prerequisites, API startup, verify health |
| [Workspaces](guide/workspaces.md) | Digital Twin · Imaging Console · Engineering Studio |
| [Imaging Console](guide/imaging-console.md) | Operator windows, MRI API, themes, models |
| [Architecture](guide/architecture.md) | Data flow GUI ↔ Twin / Agents / MRI APIs |
| [Twin API](guide/twin-api.md) | Endpoints + Agents API contract |
| [Dashboard](guide/dashboard.md) | Panels, viewport tools, Agents, terminal, camera |
| [Desktop packaging](packaging/index.md) | Tauri v2, Python sidecar, installers, signing |
| [Docs site](project/docs-site.md) | Building with Zensical |
