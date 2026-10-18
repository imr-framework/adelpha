"""PINN model status and inference tools."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

import numpy as np
from numpy.typing import NDArray

from dtam.digital_twin.models.thermal.pinn.predictor import try_load_predictor
from dtam.tools.base import error_result, ok_result
from dtam.tools.paths import pinn_model_dir


def _load_manifest(model_dir: Path) -> dict[str, Any] | None:
    manifest_path = model_dir / "manifest.json"
    if not manifest_path.is_file():
        return None
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        return None
    return cast(dict[str, Any], payload)


def pinn_model_status() -> dict[str, Any]:
    """Report whether a trained PINN artifact is present for the orchestrator."""
    model_dir = pinn_model_dir()
    onnx = model_dir / "model.onnx"
    pt = model_dir / "model.pt"
    pth = model_dir / "model.pth"
    manifest = _load_manifest(model_dir)
    present = onnx.is_file() or pt.is_file() or pth.is_file()
    predictor = try_load_predictor(model_dir)
    return ok_result(
        "pinn_model_status",
        model_dir=str(model_dir),
        present=present,
        has_onnx=onnx.is_file(),
        has_pytorch=pt.is_file() or pth.is_file(),
        has_manifest=manifest is not None,
        inference_ready=predictor is not None,
        inference_backend=predictor.backend if predictor else None,
        manifest=manifest,
        upload_instructions=(
            "Train with: uv run --extra pinn python -m "
            "dtam.digital_twin.models.thermal.pinn.train --out data/models/pinn "
            "Or place model.pt / model.onnx + manifest.json in data/models/pinn/."
        ),
    )


def _features_from_payload(payload: dict[str, Any]) -> NDArray[np.float32]:
    """Build (N, 4) features [t_s, T0_c, T_star_c, tau_s] from JSON payload."""
    if "features" in payload:
        arr = np.asarray(payload["features"], dtype=np.float32)
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)
        if arr.shape[1] != 4:
            raise ValueError("features must have shape (N, 4)")
        return arr

    t_s = float(payload.get("t_s", payload.get("horizon_s", 0.0)))
    if "T0_c" in payload:
        t0 = float(payload["T0_c"])
    elif "t0_c" in payload:
        t0 = float(payload["t0_c"])
    else:
        raise ValueError("payload requires T0_c (or features)")
    tau = float(payload.get("tau_s", 60.0))
    if "T_star_c" in payload:
        t_star = float(payload["T_star_c"])
    elif "t_star_c" in payload:
        t_star = float(payload["t_star_c"])
    else:
        rate = float(payload.get("magnet_heating_rate_c_per_s", 0.0))
        t_star = t0 + rate * tau
    return np.asarray([[t_s, t0, t_star, tau]], dtype=np.float32)


def run_pinn_inference(payload_json: str = "{}") -> dict[str, Any]:
    """Run thermal PINN inference if a trained model file is available.

    Payload may be either:
    - ``{"features": [[t_s, T0_c, T_star_c, tau_s], ...]}``
    - ``{"t_s": ..., "T0_c": ..., "T_star_c": ..., "tau_s": ...}``
    - ``{"horizon_s": ..., "T0_c": ..., "magnet_heating_rate_c_per_s": ...}``
    """
    status = pinn_model_status()
    if not status["data"]["present"]:
        return error_result(
            "run_pinn_inference",
            "PINN model not found. Train or upload weights to data/models/pinn/.",
            error_code="PINN_MODEL_MISSING",
            model_dir=status["data"]["model_dir"],
            upload_instructions=status["data"]["upload_instructions"],
        )

    model_dir = Path(status["data"]["model_dir"])
    try:
        payload = json.loads(payload_json) if payload_json else {}
        if not isinstance(payload, dict):
            raise ValueError("payload_json must decode to an object")
    except (json.JSONDecodeError, ValueError) as exc:
        return error_result(
            "run_pinn_inference",
            f"Invalid payload_json: {exc}",
            error_code="INVALID_PAYLOAD",
        )

    predictor = try_load_predictor(model_dir)
    if predictor is None:
        return error_result(
            "run_pinn_inference",
            "PINN artifact present but no inference backend is available. "
            "Install the pinn extra: uv sync --extra pinn",
            error_code="PINN_BACKEND_MISSING",
            model_dir=str(model_dir),
            payload=payload,
        )

    try:
        features = _features_from_payload(payload)
        predictions = predictor.predict_batch(features)
    except Exception as exc:  # noqa: BLE001
        return error_result(
            "run_pinn_inference",
            str(exc),
            error_code="PINN_INFERENCE_FAILED",
            model_dir=str(model_dir),
            payload=payload,
        )

    return ok_result(
        "run_pinn_inference",
        backend=predictor.backend,
        model_dir=str(model_dir),
        features=features.tolist(),
        T_hat_c=predictions.tolist(),
        model_version=predictor.model_version,
    )
