---
icon: lucide/waypoints
---

# Architecture

The GUI is an **observer + operator client** organized into **workspaces**. Twin telemetry is read-only from the Twin HTTP API. Agents chat uses Google ADK’s API server. The Imaging Console uses a FastAPI façade in this repo; closed-loop hardware I/O stays in Python (FLOCRA / MaRCoS), not in TypeScript.

``` mermaid
flowchart TB
  subgraph DTAM["DTAM backends"]
    T["Twin API :8080\nmake twin-api"]
    A["Agents API :8001\nmake agents-api"]
  end

  subgraph MRI["Adelpha console/"]
    M["MRI API :8002\npython -m services.api"]
    Q["scan.json + PREPARED queue"]
  end

  subgraph UI["Adelpha GUI"]
    TB["Top bar\nSystem Context · Workspace switcher"]
    DT["Digital Twin workspace"]
    IC["Imaging Console workspace"]
    ES["Engineering Studio placeholder"]
    PD["/api/dtam proxy"]
    PA["/api/agents proxy"]
    PM["/api/mri proxy"]
    D["attachDtamTelemetryDriver"]
    Z["Zustand stores"]
  end

  TB --> DT
  TB --> IC
  TB --> ES
  PD --> T
  PA --> A
  PM --> M
  M --> Q
  D -->|poll 1.5s| PD
  D --> Z
  DT --> Z
  DT -->|forecast / assess| PD
  DT -->|Agents chat| PA
  IC --> PM
```

## Workspace routing

`App.tsx` holds `workspace: WorkspaceId` (`digital-twin` | `imaging-console` | `engineering-studio`). Launch workspace comes from [Workspace settings](configuration.md#persisted-client-preferences): last used if **Restore layout** is on, otherwise **Startup workspace**.

| Workspace | Main content |
| --- | --- |
| `digital-twin` | Viewport + resizable side panel + bottom console |
| `imaging-console` | Full-width `ImagingConsole` |
| `engineering-studio` | Placeholder card |

Alt workspaces add `main-alt-workspace` to hide the twin viewport, panel edge, and side panel.

## Client modules

| Module | Responsibility |
| --- | --- |
| `src/twin/TopbarControls.tsx` | System Context dropdown, workspace switcher (⌘K), app menu |
| `src/twin/workspacePrefs.ts` | Persisted startup workspace / restore layout / panel width |
| `src/twin/ImagingConsole.tsx` | Imaging Console shell (viewers + sequence editor) |
| `src/twin/Mri4allWindows.tsx` | Status, Log, Config, Study Viewer, Flex |
| `src/twin/mri/api.ts` | MRI console REST + WebSocket client |
| `src/twin/consoleTheme.ts` | Adelpha vs MRI4ALL console colors |
| `src/twin/scannerModel.ts` | Halbach / Zeugmatron Z1 profiles for Status |
| `src/twin/dtamApi.ts` | Twin: health, state, forecast, assess, sensors |
| `src/twin/adkApi.ts` | Agents: sessions, SSE / run, list-apps, artifacts |
| `src/twin/dtamTypes.ts` | TypeScript mirrors of `SystemState` / quantities |
| `src/twin/telemetryStore.ts` | Poll driver, forecast / assess actions, scene mapping |
| `src/twin/SystemConsole.tsx` | Logging + Terminal tabs |
| `src/twin/TwinTerminal.tsx` | xterm.js — browser builtins or Electron PTY |
| `src/twin/AgentChatPanel.tsx` | Agents side panel (markdown, plots, motion share) |
| `src/twin/CameraFeed.tsx` | MediaPipe head pose + motion HUD |
| `src/twin/headMotionStore.ts` | Head motion recorder + agent share bridge |
| `src/twin/ViewportToolRail.tsx` | Draggable viewport tool selector |
| `src/twin/launch/LaunchScreen.tsx` | Session intro animation |
| `src/App.tsx` | Shell, workspace routing, panels, live dashboard |
| `console/services/api/app.py` | MRI FastAPI façade |

## Polling vs forecast

- **Poll** `GET /twin/state` without a horizon so live channels stay cheap.
- **Forecast** only on explicit user action (`POST /twin/forecast` with `predict_horizon_s > 0`).
- Predicted scalars stay `null` until a horizon is requested; the UI must not style them as measurements.

## Scene mapping

`systemStateToTelemetry()` projects twin fields into the compact `TwinTelemetry` shape the 3D magnet still consumes (e.g. \(B_0\) in mT, magnet / room temperatures, RF noise floor). The side panel always reads nested `SystemState` quantities (`state.thermal?.mean_magnet_temperature_c?.value`, …).

## Desktop shell

Tauri v2 (`src-tauri/`) loads the Vite UI, spawns `adelpha-python-runtime`, and exposes a real PTY to the Terminal tab. Camera access uses `src-tauri/Info.plist` (`NSCameraUsageDescription`). See [Desktop packaging](../packaging/index.md).

Electron (`electron/main.cjs`) remains as a comparison shell: loopback static server, `/api/*` proxies to fixed ports, `node-pty` via `electron/preload.cjs`. `npm run electron:dev` is `npm run build && electron .` — a production build, not Vite HMR.
