---
title: Adelpha MRI Twin, Agents, and MRI APIs
description: HTTP contracts Adelpha MRI uses for DTAM twin state, Google ADK agents, and the imaging-console FastAPI façade in desktop and browser modes.
icon: lucide/globe
---

# Twin API, Agents API, and MRI API (GUI contract)

Authoritative DTAM HTTP docs: `sidecar/dtam/docs/platform/twin-api.md` in this repo. OpenAPI: `/docs` on the Twin service. Imaging Console routes: `/docs` on the MRI façade.

The **desktop app** mounts all three under one supervisor (`/api/dtam`, `/api/agents`, `/api/mri`). The table below is for **browser / extra terminals**.

## Backends this GUI expects

| Backend | Command | Default URL | Vite proxy | Required? |
| --- | --- | --- | --- | --- |
| Twin HTTP API | from `sidecar/dtam/`: `make twin-api` | `http://127.0.0.1:8080` | `/api/dtam` → `:8080` | **Yes** (Digital Twin in the browser) |
| Agents API (ADK) | from `sidecar/dtam/`: `make agents-api` | `http://127.0.0.1:8001` | `/api/agents` → `:8001` | No (Agents tab only) |
| MRI console API | from `sidecar/console/`: `python -m services.api` | `http://127.0.0.1:8002` | `/api/mri` → `:8002` | **Yes** (Imaging Console in the browser) |

```bash
cd sidecar/dtam && make twin-api
cd sidecar/dtam && make agents-api    # needs GOOGLE_API_KEY
cd sidecar/console && python -m services.api
```

GUI base URLs (env):

| Variable | Default | Points at |
| --- | --- | --- |
| `VITE_DTAM_API_URL` | `/api/dtam` | Twin API (via proxy) |
| `VITE_ADK_API_URL` | `/api/agents` | Agents API (via proxy) |
| `VITE_MRI_API_URL` | `/api/mri` | MRI console API (via proxy) |

## Twin API endpoints used

| Method | Path | When |
| --- | --- | --- |
| `GET` | `/health` | Connection badge / every poll |
| `GET` | `/twin/state` | Live dashboard (~1.5 s) |
| `POST` | `/twin/forecast` | Forecast form submit |
| `POST` | `/assess/from-twin` | Deterministic assessment from live twin |
| `GET` | `/sensors/batch` | Optional raw channels table |
| `GET` | `/devices` | Device listener, connected boards, control flag |
| `GET` | `/devices/{id}/readings` | Last accepted publication from a connected board |
| `POST` | `/devices/control` | Enable or disable Physical control |
| `POST` | `/devices/commands` | Forward `actuators.set` to a connected board |

Boards do not use this HTTP port. They connect to the WebSocket listener from `devices.json` (default `8765`). See [Device link](devices.md).

### Live subsystems

| Subsystem | Status in UI |
| --- | --- |
| Thermal | Mean magnet °C, room, \(\Delta T\), channels; predicted mean after forecast |
| Magnetic / \(B_0\) | Nominal vs estimated \(B_0\), \(\Delta B_0\), \(f_0\) in MHz; predicted after forecast |
| EMI | RMS (V) from hardware `voltage_rms`; peak Hz / classification when present. No hardware spectrum. |
| RF | Noise floor (dBm/Hz) when a board publishes `rf_noise_floor` |

Gradient and image-quality channels are **not** ready in DTAM. Actuator commands exist on `/devices/commands` and stay rejected until a hardware profile, `allow_control`, and Physical control are all enabled.

### Verify Twin API

```bash
curl -s http://127.0.0.1:8080/health | jq
curl -s http://127.0.0.1:8080/twin/state | jq
curl -s -X POST http://127.0.0.1:8080/twin/forecast \
  -H 'content-type: application/json' \
  -d '{"predict_horizon_s": 60}' | jq
```

## Agents API (ADK)

Used by the **Agents** side-panel tab (`src/twin/adkApi.ts`).

| Expectation | Detail |
| --- | --- |
| Process | `make agents-api` in DTAM (ADK `api_server` on **8001**) |
| Auth | `GOOGLE_API_KEY` (or Google AI Studio credentials) visible to that process |
| App name | Default `dtam` (`VITE_ADK_APP_NAME`) |
| CORS | DTAM `agents-api` already allows Vite `:5173` origins |

Without Agents API up, Twin telemetry still works; the Agents panel reports offline on `:8001`.

## Physics copy (for operators)

Thermal coupling to field:

\[
\Delta B_0 \approx \alpha_T \cdot \Delta T
\]

with default \(\alpha_T \approx -5\times 10^{-5}\,\mathrm{T/°C}\). Resonant frequency is exposed in **MHz**, not Hz.

Forecast prefers a thermal PINN when an artifact is present; otherwise linear-rate fallback. Notes on the response mention `thermal_forecast=pinn` or `linear_rate`.

## Client sketch

```ts
const base = import.meta.env.VITE_DTAM_API_URL ?? "/api/dtam";

export async function fetchTwinState() {
  const res = await fetch(`${base}/twin/state`, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

Errors from the twin routes are HTTP 500 with `{ "detail": "..." }`; the UI shows `detail` in an error banner.

## MRI console API (Imaging Console)

The façade lives in `sidecar/console/services/api/app.py`. Groups used by the UI:

| Area | Examples |
| --- | --- |
| Health / about | `GET /health`, `GET /about` (version is Adelpha **0.1.0**) |
| Exam | start / end exam, current exam |
| Scans | list, create, prepare, edit, stop, patch name, duplicate, delete |
| Studies | list, preview, export, clone, DICOM send |
| Device | ping, test, reset, disk, scanner PNG |
| Services | acq/recon start, stop, kill |
| Logs | `GET /logs/{acq\|recon\|ui\|api}` |
| Events | WebSocket `/events` |

Restarting this process clears the in-memory exam. See [Imaging Console](imaging-console.md).
