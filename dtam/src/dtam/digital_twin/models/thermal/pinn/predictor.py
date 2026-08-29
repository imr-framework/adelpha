"""Load and run a trained thermal PINN for mean-magnet temperature forecasts."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

from dtam.config.paths import pinn_model_dir


@dataclass(frozen=True)
class ThermalPinnPrediction:
    """Single-horizon magnet temperature forecast."""

    temperature_c: float
    horizon_s: float
    t0_c: float
    t_star_c: float
    tau_s: float
    backend: str
    model_version: str = "thermal-pinn-v1"


class ThermalPinnPredictor:
    """Inference wrapper preferring ``model.pt``, then ``model.onnx``."""

    def __init__(
        self,
        model_dir: Path | None = None,
        *,
        default_tau_s: float = 60.0,
    ) -> None:
        self.model_dir = Path(model_dir) if model_dir else pinn_model_dir()
        self.default_tau_s = default_tau_s
        self._backend: str | None = None
        self._torch_model: Any = None
        self._ort_session: Any = None
        self._model_version = "thermal-pinn-v1"
        self._load()

    @property
    def available(self) -> bool:
        return self._backend is not None

    @property
    def backend(self) -> str | None:
        return self._backend

    @property
    def model_version(self) -> str:
        return self._model_version

    def _load(self) -> None:
        pt = self.model_dir / "model.pt"
        pth = self.model_dir / "model.pth"
        onnx = self.model_dir / "model.onnx"
        ckpt = pt if pt.is_file() else pth if pth.is_file() else None
        if ckpt is not None:
            try:
                self._load_torch(ckpt)
                return
            except ImportError:
                pass
            except Exception:  # noqa: BLE001
                pass
        if onnx.is_file():
            try:
                self._load_onnx(onnx)
            except Exception:  # noqa: BLE001
                self._backend = None

    def _load_torch(self, path: Path) -> None:
        import torch

        from dtam.digital_twin.models.thermal.pinn.network import ThermalPINN

        payload = torch.load(path, map_location="cpu", weights_only=False)
        if isinstance(payload, dict) and "state_dict" in payload:
            hidden = int(payload.get("hidden", 64))
            depth = int(payload.get("depth", 3))
            self._model_version = str(
                payload.get("model_version", "thermal-pinn-v1")
            )
            model = ThermalPINN(hidden=hidden, depth=depth)
            model.load_state_dict(payload["state_dict"])
        else:
            model = ThermalPINN()
            model.load_state_dict(payload)
        model.eval()
        self._torch_model = model
        self._backend = "torch"

    def _load_onnx(self, path: Path) -> None:
        import onnxruntime as ort

        self._ort_session = ort.InferenceSession(str(path))
        self._backend = "onnxruntime"

    def predict_mean_magnet_c(
        self,
        *,
        t0_c: float,
        horizon_s: float,
        t_star_c: float | None = None,
        tau_s: float | None = None,
        magnet_heating_rate_c_per_s: float = 0.0,
    ) -> ThermalPinnPrediction:
        if not self.available:
            raise RuntimeError(
                f"No thermal PINN artifact found under {self.model_dir}"
            )
        tau = float(tau_s if tau_s is not None else self.default_tau_s)
        if t_star_c is None:
            # Implied setpoint from constant heating rate on the plant ODE.
            t_star = float(t0_c + magnet_heating_rate_c_per_s * tau)
        else:
            t_star = float(t_star_c)
        features = np.asarray(
            [[float(horizon_s), float(t0_c), t_star, tau]],
            dtype=np.float32,
        )
        value = self._infer(features)[0]
        return ThermalPinnPrediction(
            temperature_c=float(value),
            horizon_s=float(horizon_s),
            t0_c=float(t0_c),
            t_star_c=t_star,
            tau_s=tau,
            backend=self._backend or "unknown",
            model_version=self._model_version,
        )

    def predict_batch(self, features: NDArray[np.float32]) -> NDArray[np.float64]:
        """Run inference on ``(N, 4)`` feature matrix."""
        if not self.available:
            raise RuntimeError(
                f"No thermal PINN artifact found under {self.model_dir}"
            )
        arr = np.asarray(features, dtype=np.float32)
        if arr.ndim != 2 or arr.shape[1] != 4:
            raise ValueError("features must have shape (N, 4)")
        return self._infer(arr)

    def _infer(self, features: NDArray[np.float32]) -> NDArray[np.float64]:
        if self._backend == "torch" and self._torch_model is not None:
            import torch

            with torch.no_grad():
                x = torch.as_tensor(features, dtype=torch.float32)
                out = self._torch_model(x)
                result = out.detach().cpu().numpy()
                return np.asarray(result, dtype=np.float64).reshape(-1)
        if self._backend == "onnxruntime" and self._ort_session is not None:
            out = self._ort_session.run(None, {"features": features})[0]
            return np.asarray(out, dtype=np.float64).reshape(-1)
        raise RuntimeError("PINN backend not loaded")


def try_load_predictor(
    model_dir: Path | None = None,
    *,
    default_tau_s: float = 60.0,
) -> ThermalPinnPredictor | None:
    """Return a predictor if artifacts exist, else ``None``."""
    predictor = ThermalPinnPredictor(
        model_dir, default_tau_s=default_tau_s
    )
    return predictor if predictor.available else None
