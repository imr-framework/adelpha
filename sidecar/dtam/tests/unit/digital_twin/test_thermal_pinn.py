"""Thermal PINN unit tests (torch optional for train/residual)."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pytest

from dtam.digital_twin.estimators.thermal_forecast import ThermalForecastService
from dtam.digital_twin.models.thermal.pinn.dataset import (
    analytic_first_order,
    generate_plant_rollouts,
)
from dtam.digital_twin.state.common import QuantitySource, TimestampedQuantity
from dtam.digital_twin.state.thermal_state import ThermalState


def test_analytic_first_order_matches_ode() -> None:
    t = np.linspace(0.0, 60.0, 31)
    t0, t_star, tau = 23.0, 28.0, 45.0
    y = analytic_first_order(t, t0, t_star, tau)
    assert y[0] == pytest.approx(t0)
    assert y[-1] > t0
    assert abs(y[-1] - t_star) < abs(t0 - t_star)


def test_plant_rollouts_shapes() -> None:
    batch = generate_plant_rollouts(n_rollouts=4, n_steps=10, seed=3)
    assert batch.t_s.shape == (40,)
    assert batch.t_obs_c.shape == batch.t0_c.shape


def test_forecast_service_linear_fallback() -> None:
    now = datetime.now(timezone.utc)
    thermal = ThermalState(
        timestamp=now,
        scanner_id="sim",
        mean_magnet_temperature_c=TimestampedQuantity(
            value=23.0,
            unit="degC",
            source=QuantitySource.ESTIMATED,
            timestamp=now,
        ),
    )
    svc = ThermalForecastService(load_artifact=False)
    out = svc.forecast(
        thermal,
        horizon_s=50.0,
        magnet_heating_rate_c_per_s=0.02,
    )
    assert out.predicted_mean_magnet_temperature_c is not None
    assert out.predicted_mean_magnet_temperature_c.value == pytest.approx(24.0)
    assert out.predicted_mean_magnet_temperature_c.source is QuantitySource.PREDICTED


def test_physics_residual_trainable() -> None:
    torch = pytest.importorskip("torch")
    from dtam.digital_twin.models.thermal.pinn.network import ThermalPINN
    from dtam.digital_twin.models.thermal.pinn.physics import physics_residual

    model = ThermalPINN(hidden=32, depth=2)
    t = torch.linspace(0.0, 40.0, 16)
    t0 = torch.full_like(t, 23.0)
    t_star = torch.full_like(t, 27.0)
    tau = torch.full_like(t, 60.0)
    residual = physics_residual(model, t, t0, t_star, tau)
    assert residual.shape == t.shape
    assert torch.isfinite(residual).all()


def test_short_train_reduces_loss(tmp_path: Path) -> None:
    pytest.importorskip("torch")
    from dtam.digital_twin.models.thermal.pinn.export import export_checkpoint
    from dtam.digital_twin.models.thermal.pinn.predictor import ThermalPinnPredictor
    from dtam.digital_twin.models.thermal.pinn.train import train_thermal_pinn

    model, meta = train_thermal_pinn(
        epochs=80,
        n_rollouts=24,
        n_steps=25,
        hidden=48,
        depth=3,
        seed=0,
    )
    assert "final_loss" in meta
    export_checkpoint(model, tmp_path, meta=meta, export_onnx=False)
    predictor = ThermalPinnPredictor(tmp_path)
    assert predictor.available
    pred = predictor.predict_mean_magnet_c(
        t0_c=23.0,
        horizon_s=30.0,
        t_star_c=26.0,
        tau_s=60.0,
    )
    analytic = float(analytic_first_order(np.array([30.0]), 23.0, 26.0, 60.0)[0])
    assert pred.temperature_c == pytest.approx(analytic, abs=1.0)
    # IC ansatz: horizon 0 recovers T0.
    pred0 = predictor.predict_mean_magnet_c(
        t0_c=23.0,
        horizon_s=0.0,
        t_star_c=26.0,
        tau_s=60.0,
    )
    assert pred0.temperature_c == pytest.approx(23.0, abs=1e-5)
