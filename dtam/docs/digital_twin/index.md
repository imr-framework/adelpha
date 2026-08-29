---
icon: lucide/thermometer
---

# Phase 2 — Thermal and B₀ digital twin

Phase 2 adds a working vertical slice:

```text
Simulated temperatures
  → synchronization window
  → thermal state estimate
  → thermal→B₀ model
  → B₀ / f₀ estimate (+ optional prediction)
```

## Packages

| Area | Path |
| --- | --- |
| Twin states | `dtam.digital_twin.state` (thermal, magnetic, EMI, RF) |
| Physics models | `dtam.digital_twin.models.thermal`, `...magnetic_field` |
| Thermal PINN | `dtam.digital_twin.models.thermal.pinn` |
| Estimators | `dtam.digital_twin.estimators` |
| Sync | `dtam.digital_twin.synchronization` |
| Service | `dtam.digital_twin.service.ThermalMagneticTwin` |
| Thermal plant / drift scenario | `dtam.simulation.thermal`, `dtam.simulation.scenarios` |
| Acquisition facades | `dtam.acquisition.{temperature,emi,rf}` |

Architecture overview: [Architecture](../architecture/index.md) · [System map](../architecture/system-map.md) · [Mathematical models](mathematical-models.md) · [Why a state system?](../architecture/why-state-system.md).

## Physics

Full equations (thermal plant, \(\alpha_T\), \(f_0\), PINN / fallback, EMI/RF heuristics):
[Mathematical models](mathematical-models.md).

Thermal coupling:

\[
\Delta B_0(t) = \alpha_T \, \Delta T(t)
\]

Resonant frequency:

\[
f_0(t) = \frac{\gamma}{2\pi}\, B_0(t)
\]

Optional **thermal PINN** forecast uses the same ODE as the simulated plant.
Design, loss, artifacts, and runtime API are documented in
[Thermal PINN](thermal-pinn.md).

Train with `uv sync --extra pinn` then:

```bash
uv run --extra pinn python -m dtam.digital_twin.models.thermal.pinn.train --out data/models/pinn
```

When `model.pt` / `model.onnx` is present, `ThermalMagneticTwin.update(..., predict_horizon_s=...)` uses the PINN for `predicted_mean_magnet_temperature_c` and maps it through `ThermalToB0`. Without an artifact, prediction falls back to a constant heating rate.

Twin magnetic state reports \(f_0\) in **MHz** (`resonant_frequency_mhz`); temperature remains in **°C**. Coefficients are configured in `configs/models.yaml` (`alpha_t_tesla_per_c` default \(-5\times10^{-5}\) T/°C).

## Distinguishability

States keep **measured**, **estimated**, and **predicted** quantities separate via `QuantitySource` on `TimestampedQuantity`. See [Why a state system?](../architecture/why-state-system.md) for the design rationale.

## Example

```python
from dtam import bootstrap
from dtam.digital_twin import ThermalMagneticTwin, TwinConfig
from dtam.simulation.scenarios import ThermalDriftScenario

app = bootstrap(scanner_id="simulated_scanner")
twin = ThermalMagneticTwin(
    TwinConfig(nominal_b0_t=app.adapter.identity.field_strength_t)
)
state = twin.update(app.adapter.read_measurements())
ThermalDriftScenario().run(app.adapter)
drifted = twin.update(app.adapter.read_measurements(), predict_horizon_s=60.0)
```

Agent tool: `estimate_thermal_b0_state` (thermal / magnet / orchestrator tool groups).
