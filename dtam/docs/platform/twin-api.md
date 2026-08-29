---
icon: lucide/globe
---

# Twin HTTP API

Thin FastAPI surface over `ThermalMagneticTwin` for dashboards and Next.js GUIs.
Agents continue to use Google ADK tools; this API does not replace them.

## Run

```bash
make twin-api
# or: uv run python -m dtam.api
# or: uv run dtam-twin-api
```

Default: `http://127.0.0.1:8080` (OpenAPI at `/docs`).

| Env var | Default | Purpose |
| --- | --- | --- |
| `DTAM_API_HOST` | `127.0.0.1` | Bind address |
| `DTAM_API_PORT` | `8080` | Port |
| `DTAM_API_RELOAD` | unset | Set `1` for uvicorn reload |
| `DTAM_SCANNER_ID` | `simulated_scanner` | Adapter profile |
| `DTAM_ENVIRONMENT` | `development` | Config environment |
| `DTAM_CORS_ORIGINS` | `http://localhost:3000`, `:5173` (and 127.0.0.1 variants) | Comma-separated CORS allowlist |

Default CORS covers Next.js (`:3000`) and Vite (`:5173`). Override with `DTAM_CORS_ORIGINS` if the GUI uses another origin.

For the ADK chat API used by the AGENTS tab, prefer:

```bash
make agents-api
# → http://127.0.0.1:8001 with Vite/Next CORS origins
```

## Endpoints

| Method | Path | Role |
| --- | --- | --- |
| `GET` | `/health` | Liveness + scanner connection |
| `GET` | `/twin/state` | Read sensors → twin snapshot (optional `predict_horizon_s`) |
| `POST` | `/twin/forecast` | Twin update with required horizon (PINN / linear fallback) |
| `GET` | `/sensors/batch` | Raw `MeasurementBatch` from the adapter |
| `POST` | `/assess` | Deterministic multi-agent assessment on observation JSON |
| `POST` | `/assess/from-twin` | Live twin update → assessment (no LLM) |

Responses for twin routes are `SystemState` JSON (`thermal`, `magnetic`, `emi`, `rf`, …).
Assessment routes return `DigitalTwinAssessment` (or twin + assessment for `/assess/from-twin`).

### Examples

```bash
curl -s http://127.0.0.1:8080/health | jq
curl -s 'http://127.0.0.1:8080/twin/state' | jq
curl -s -X POST http://127.0.0.1:8080/twin/forecast \
  -H 'content-type: application/json' \
  -d '{"predict_horizon_s": 60, "magnet_setpoint_c": 26}' | jq

# Live twin → specialist routing / findings / safety (no Gemini)
curl -s -X POST http://127.0.0.1:8080/assess/from-twin \
  -H 'content-type: application/json' \
  -d '{"mode": "recommend"}' | jq

# Supply an observation fixture
curl -s -X POST 'http://127.0.0.1:8080/assess?mode=recommend' \
  -H 'content-type: application/json' \
  -d @src/dtam/agents/examples/thermal_drift.json | jq
```

## Next.js

Point the GUI at the API (or proxy via Next rewrites):

```ts
const res = await fetch(`${process.env.NEXT_PUBLIC_DTAM_API_URL}/twin/state`);
const state = await res.json();
```

`next.config` rewrite example (browser stays same-origin):

```js
async rewrites() {
  return [
    { source: "/api/dtam/:path*", destination: "http://127.0.0.1:8080/:path*" },
  ];
}
```

## Package layout

| Module | Role |
| --- | --- |
| `dtam.api.app` | FastAPI app + CORS |
| `dtam.api.session` | Bootstrap adapter + twin updates |
| `dtam.api.schemas` | Request models |

Domain / twin code stays free of FastAPI imports (see [Dependency rules](../architecture/dependency-rules.md)).
