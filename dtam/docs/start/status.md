---
icon: lucide/list-checks
---

# Status

This page describes the repository as implemented, not the full long-term architecture. See [Architecture](../architecture/index.md) and [System map](../architecture/system-map.md).

## Phase 1 — Foundation (done)

| Area | Package / path | Notes |
| --- | --- | --- |
| Bootstrap | `dtam.bootstrap` | Loads settings, logging, adapter |
| Configuration | `dtam.config` + `configs/` | Layered YAML → Pydantic models |
| Domain | `dtam.domain` | Modes, measurements, value objects, capabilities |
| Exceptions | `dtam.core.exceptions` | Structured error hierarchy |
| Logging | `dtam.observability.logging` | structlog setup |
| Adapter contract | `dtam.scanner_adapters.base` | `ScannerAdapter` ABC |
| Simulated scanner | `dtam.scanner_adapters.simulated_scanner` | Temp + EMI + RF noise virtual sensors |
| Halbach profile | `dtam.scanner_adapters.halbach_48mt` | Profile/capabilities only; no physical I/O |

## Phase 2 — Thermal + B₀ twin (done)

| Area | Package / path | Notes |
| --- | --- | --- |
| Twin states | `dtam.digital_twin.state` | Thermal + magnetic |
| Thermal→B₀ / \(f_0\) | models + estimators | \(\Delta B_0=\alpha_T\Delta T\), \(f_0\) in MHz |
| Thermal PINN | `digital_twin.models.thermal.pinn` | Forecast; see [Thermal PINN](../digital_twin/thermal-pinn.md) |
| Twin service | `ThermalMagneticTwin` | Sync → estimate → optional predict |

## Phase 2b — EMI + RF noise slice (done)

| Area | Package / path | Notes |
| --- | --- | --- |
| Acquisition facades | `acquisition/{temperature,emi,rf}` | Thin wrappers over adapter |
| EMI / RF states | `EmiState`, `RfState` | Part of `SystemState` |
| Estimators | `EmiEstimator`, `RfNoiseEstimator` | Measured → estimated aggregates |
| Tools | `estimate_twin_state`, EMI/RF reads | ADK agent-facing |
| Agents | root `sub_agents` + specialists | Google ADK assessment core + skills |
| Twin HTTP API | `dtam.api` / `make twin-api` | REST for Next.js / dashboards |
| Assessment CLI | `python -m dtam.agents.main` | Deterministic observe/recommend (no LLM) |

## Scaffolded / deferred

- Gradient / image-quality twin states and acquisition
- `control/`, `workflows/`, `feedback/`, full `safety/` closed loop
- Safety / Sequence / Imaging agents beyond thin shells
- Physical drivers (Raspberry Pi, Red Pitaya, …)

!!! warning "Do not assume empty packages are ready"
    Prefer the Phase 1–2b surfaces above until later phases land working code and tests.

## Defaults that matter for safety

- Default scanner: **simulated** (`simulated_scanner`)
- Default mode: **simulation**
- `automatic_control: false`
- Physical Halbach adapter **refuses** hardware I/O in Phase 1–2b
