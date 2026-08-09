---
icon: lucide/layout-dashboard
---

# Dashboard

## Header

Shows **Adelpha** branding plus:

- connection status (`connected` / `connecting…` / `disconnected`)
- `scanner_id`, `mode`
- `twin_version` (e.g. `phase2b-thermal-emi-rf-v1`)
- last `SystemState.timestamp`

## Side panels

1. **Telemetry** — Thermal, Magnetic / \(B_0\), EMI, RF summaries.
2. **Agents** — Chat against DTAM ADK (`make agents-api` on `:8001`). Offline until that API is up.
3. **Forecast** — Horizon (s), optional magnet setpoint (°C), heating rate, PINN toggle → **Run forecast**.
4. **Notes** — `notes[]` from the twin (ops / debug).
5. **Raw sensors** — on-demand `GET /sensors/batch`.
6. **View / CAD** — exploded slider, wireframe, temperature map (when an STL is configured).

## Provenance

Every `TimestampedQuantity` carries `source`. Badges:

| Source | Meaning |
| --- | --- |
| `measured` | Sensor channel |
| `estimated` | Derived twin estimate |
| `predicted` | Forecast horizon only |
| `nominal` | Design / profile constant |

Confidence is shown when present. Units stay visible (never strip °C, T, MHz, …).

## Overlay charts

“Open live dashboard” overlays history charts for magnet temperature and RF noise floor, plus illustrative spectra. EMI peak frequency biases the MRI spectrum highlight; these plots are operator aids, not calibrated spectrum analyzers.

## Console

Bottom console tabs:

- **Logging** — read-only system events
- **Terminal** — commands (`help`, `clear`, `status`, `sensors`, …) talking to the Twin API

## Out of scope

- Shim / gradient / safety override **commands** (no such Twin API actuators)
- Treating predicted values as live measurements
- Embedding Python / Gemini SDKs in the browser (use DTAM `make agents-api` instead)
