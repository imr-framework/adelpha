---
icon: lucide/waypoints
---

# Architecture

The GUI is an **observer + chat client** organized into **workspaces**. Twin telemetry is read-only from the Twin HTTP API; Agents chat uses Google ADK’s API server. Closed-loop hardware control is out of scope.

``` mermaid
flowchart TB
  subgraph DTAM["DTAM backends"]
    T["Twin API :8080\nmake twin-api"]
    A["Agents API :8001\nmake agents-api"]
  end

  subgraph UI["Adelpha GUI :5173"]
    TB["Top bar\nSystem Context · Workspace switcher"]
    DT["Digital Twin workspace"]
    IC["Imaging Console workspace"]
    ES["Engineering Studio placeholder"]
    PD["/api/dtam proxy"]
    PA["/api/agents proxy"]
    D["attachDtamTelemetryDriver"]
    Z["Zustand stores"]
  end

  TB --> DT
  TB --> IC
  TB --> ES
  PD --> T
  PA --> A
  D -->|poll 1.5s| PD
  D --> Z
  DT --> Z
  DT -->|forecast / assess| PD
  DT -->|Agents chat| PA
```

## Workspace routing

`App.tsx` holds `workspace: WorkspaceId` (`digital-twin` | `imaging-console` | `engineering-studio`), restored from `adelpha_workspace_id` in `localStorage`.

| Workspace | Main content |
| --- | --- |
| `digital-twin` | Viewport + resizable side panel + bottom console |
| `imaging-console` | Full-width `ImagingConsole` component |
| `engineering-studio` | Placeholder card |

Alt workspaces add `main-alt-workspace` to hide the twin viewport, panel edge, and side panel.

## Client modules

| Module | Responsibility |
| --- | --- |
| `src/twin/TopbarControls.tsx` | System Context dropdown, workspace switcher (⌘K), app menu |
| `src/twin/ImagingConsole.tsx` | Imaging Console shell (viewers + sequence editor) |
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

## Polling vs forecast

- **Poll** `GET /twin/state` without a horizon so live channels stay cheap.
- **Forecast** only on explicit user action (`POST /twin/forecast` with `predict_horizon_s > 0`).
- Predicted scalars stay `null` until a horizon is requested; the UI must not style them as measurements.

## Scene mapping

`systemStateToTelemetry()` projects twin fields into the compact `TwinTelemetry` shape the 3D magnet still consumes (e.g. \(B_0\) in mT, magnet / room temperatures, RF noise floor). The side panel always reads nested `SystemState` quantities (`state.thermal?.mean_magnet_temperature_c?.value`, …).

## Desktop shell

Electron (`electron/main.cjs`) serves the Vite `dist/` bundle, proxies Twin/Agents APIs, and exposes a real PTY to the Terminal tab via `electron/preload.cjs`. Camera access requires macOS camera permission (declared in `extendInfo`).
