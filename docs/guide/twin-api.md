---
icon: lucide/globe
---

# Twin API & Agents API (GUI contract)

Authoritative DTAM docs: Twin HTTP API in the DTAM repo (`docs/platform/twin-api.md`). Interactive OpenAPI: `http://127.0.0.1:8080/docs` when the Twin API is running.

## Backends this GUI expects

| Backend | DTAM command | Default URL | Vite proxy | Required? |
| --- | --- | --- | --- | --- |
| Twin HTTP API | `make twin-api` | `http://127.0.0.1:8080` | `/api/dtam` → `:8080` | **Yes** |
| Agents API (ADK) | `make agents-api` | `http://127.0.0.1:8001` | `/api/agents` → `:8001` | No (Agents tab only) |

```bash
# From the DTAM repository — leave each process running in its own terminal
make twin-api      # Twin REST for telemetry / forecast / assess
make agents-api    # ADK api_server for Agents chat (needs GOOGLE_API_KEY)
```

GUI base URLs (env):

| Variable | Default | Points at |
| --- | --- | --- |
| `VITE_DTAM_API_URL` | `/api/dtam` | Twin API (via proxy) |
| `VITE_ADK_API_URL` | `/api/agents` | Agents API (via proxy) |

## Twin API endpoints used

| Method | Path | When |
| --- | --- | --- |
| `GET` | `/health` | Connection badge / every poll |
| `GET` | `/twin/state` | Live dashboard (~1.5 s) |
| `POST` | `/twin/forecast` | Forecast form submit |
| `POST` | `/assess/from-twin` | Deterministic assessment from live twin |
| `GET` | `/sensors/batch` | Optional raw channels table |

### Live subsystems

| Subsystem | Status in UI |
| --- | --- |
| Thermal | Mean magnet °C, room, \(\Delta T\), channels; predicted mean after forecast |
| Magnetic / \(B_0\) | Nominal vs estimated \(B_0\), \(\Delta B_0\), \(f_0\) in MHz; predicted after forecast |
| EMI | RMS (V), peak Hz, classification |
| RF | Noise floor (dBm/Hz), bandwidth |

Gradient / image-quality / actuators are **not** ready in DTAM — do not invent control buttons.

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
