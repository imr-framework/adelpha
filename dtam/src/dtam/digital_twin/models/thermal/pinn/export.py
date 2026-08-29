"""Export thermal PINN weights and manifest."""

from __future__ import annotations

import contextlib
import json
from pathlib import Path
from typing import Any

from dtam.digital_twin.models.thermal.pinn.network import ThermalPINN

THERMAL_PINN_MANIFEST: dict[str, Any] = {
    "name": "dtam-thermal-pinn",
    "framework": "pytorch",
    "version": "thermal-pinn-v1",
    "preferred_file": "model.pt",
    "physics": {
        "ode": "dT/dt = (T_star - T) / tau",
        "units": {"temperature": "degC", "time": "s"},
    },
    "inputs": [
        {
            "name": "features",
            "dtype": "float32",
            "shape": ["batch", 4],
            "columns": ["t_s", "T0_c", "T_star_c", "tau_s"],
            "description": "Time horizon and lumped thermal parameters",
        }
    ],
    "outputs": [
        {
            "name": "T_hat_c",
            "dtype": "float32",
            "shape": ["batch"],
            "description": "Predicted magnet mean temperature in degC",
        }
    ],
    "notes": [
        "Trained against ThermalPlantModel first-order dynamics.",
        "B0 coupling remains ThermalToB0 (alpha_T), not learned here.",
    ],
}


def export_checkpoint(
    model: ThermalPINN,
    out_dir: Path,
    *,
    meta: dict[str, Any] | None = None,
    export_onnx: bool = True,
) -> Path:
    """Write ``model.pt``, ``manifest.json``, and optionally ``model.onnx``."""
    import torch

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    ckpt_path = out_dir / "model.pt"
    payload = {
        "state_dict": model.state_dict(),
        "hidden": _infer_hidden(model),
        "depth": _infer_depth(model),
        "model_version": "thermal-pinn-v1",
    }
    if meta:
        payload["meta"] = meta
    torch.save(payload, ckpt_path)

    manifest = dict(THERMAL_PINN_MANIFEST)
    if meta:
        manifest["training"] = meta
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )

    if export_onnx:
        with contextlib.suppress(Exception):
            _export_onnx(model, out_dir / "model.onnx")

    return ckpt_path


def _infer_hidden(model: ThermalPINN) -> int:
    first = model.net[0]
    return int(first.out_features)  # type: ignore[attr-defined]


def _infer_depth(model: ThermalPINN) -> int:
    # Sequential: (Linear, GELU) * depth + final Linear
    return (len(list(model.net)) - 1) // 2


def _export_onnx(model: ThermalPINN, path: Path) -> None:
    import torch

    model.eval()
    dummy = torch.zeros(1, ThermalPINN.INPUT_SIZE, dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy,
        str(path),
        input_names=["features"],
        output_names=["T_hat_c"],
        dynamic_axes={
            "features": {0: "batch"},
            "T_hat_c": {0: "batch"},
        },
        opset_version=17,
    )
