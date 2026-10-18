# PINN model upload directory

Thermal PINN artifacts for magnet-temperature forecasting live here.
The Orchestrator tools `pinn_model_status` / `run_pinn_inference` and the
thermal–B₀ twin (`ThermalMagneticTwin`) load from this directory.

## Exact path

```text
data/models/pinn/
```

Override with:

```bash
export DTAM_PINN_MODEL_DIR=/absolute/path/to/your/export
```

## Train (recommended)

```bash
uv sync --extra pinn
uv run --extra pinn python -m dtam.digital_twin.models.thermal.pinn.train \
  --epochs 200 --out data/models/pinn
```

Physics target (matches `ThermalPlantModel`):

\[
\frac{dT}{dt} = \frac{T^* - T}{\tau}
\]

Network inputs: `[t_s, T0_c, T_star_c, tau_s]` → output `\hat T` (°C).
Field coupling still uses `ThermalToB0` (\(\Delta B_0 = \alpha_T \Delta T\)).

## Expected files

| File | Required | Notes |
| --- | --- | --- |
| `model.pt` | Preferred | PyTorch checkpoint from the train CLI |
| `model.onnx` | Optional | Exported when onnx is available |
| `manifest.json` | Strongly recommended | Copy from `manifest.example.json` or auto-written by train |

## Verify

```bash
uv run python -c "from dtam.tools.orchestrator import pinn_model_status; print(pinn_model_status())"
```
