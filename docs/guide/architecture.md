---
icon: lucide/waypoints
---

# Architecture

The GUI is an **observer + chat client**. Twin telemetry is read-only from the Twin HTTP API; Agents chat uses Google ADK’s API server. Closed-loop hardware control is out of scope.

``` mermaid
flowchart LR
  subgraph DTAM["DTAM backends"]
    T["Twin API :8080\nmake twin-api"]
    A["Agents API :8001\nmake agents-api"]
  end

  subgraph UI["Vite GUI :5173"]
    PD["/api/dtam proxy"]
    PA["/api/agents proxy"]
    D["attachDtamTelemetryDriver"]
    Z["Zustand store"]
    V["3D scene + panels"]
    C["Agents chat"]
  end

  PD --> T
  PA --> A
  D -->|poll 1.5s| PD
  D --> Z
  Z --> V
  V -->|forecast / assess| PD
  C --> PA
```

## Client modules

| Module | Responsibility |
| --- | --- |
| `src/twin/dtamApi.ts` | Twin: health, state, forecast, assess, sensors |
| `src/twin/adkApi.ts` | Agents: sessions, SSE / run, list-apps |
| `src/twin/dtamTypes.ts` | TypeScript mirrors of `SystemState` / quantities |
| `src/twin/telemetryStore.ts` | Poll driver, forecast / assess actions, scene mapping |
| `src/twin/SystemConsole.tsx` | Logging + Terminal |
| `src/twin/AgentChatPanel.tsx` | Agents side panel |
| `src/App.tsx` | Shell, panels, live dashboard |
| `src/twin/SceneTwin.tsx` | React Three Fiber viewport |

## Polling vs forecast

- **Poll** `GET /twin/state` without a horizon so live channels stay cheap.
- **Forecast** only on explicit user action (`POST /twin/forecast` with `predict_horizon_s > 0`).
- Predicted scalars stay `null` until a horizon is requested; the UI must not style them as measurements.

## Scene mapping

`systemStateToTelemetry()` projects twin fields into the compact `TwinTelemetry` shape the 3D magnet still consumes (e.g. \(B_0\) in mT, magnet / room temperatures, RF noise floor). The side panel always reads nested `SystemState` quantities (`state.thermal?.mean_magnet_temperature_c?.value`, …).
