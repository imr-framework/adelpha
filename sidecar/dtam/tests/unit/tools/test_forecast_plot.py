"""Tests for twin forecast PNG plotting."""

from __future__ import annotations

import base64
from pathlib import Path

from dtam.tools.state_estimation.forecast_plot import plot_twin_forecast


def test_plot_twin_forecast(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(
        "dtam.tools.state_estimation.forecast_plot.artifacts_root",
        lambda: tmp_path,
    )
    result = plot_twin_forecast(
        scanner_id="simulated_scanner",
        predict_horizon_s=30.0,
        n_points=5,
    )
    assert result["ok"] is True
    data = result["data"]
    assert data["predict_horizon_s"] == 30.0
    assert len(data["series"]) == 5
    assert data["series"][0]["t_s"] == 0.0
    assert data["series"][-1]["t_s"] == 30.0
    assert data["mime_type"] == "image/png"
    assert data["caption"]
    assert data["backend"] in {"pinn", "linear_rate", "none"}

    png = base64.b64decode(data["plot_png_base64"])
    assert png[:8] == b"\x89PNG\r\n\x1a\n"

    plot_file = tmp_path / "forecasts" / data["plot_filename"]
    assert plot_file.is_file()
    assert plot_file.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"


def test_plot_twin_forecast_rejects_nonpositive_horizon() -> None:
    result = plot_twin_forecast(predict_horizon_s=0.0)
    assert result["ok"] is False
    assert result["error_code"] == "INVALID_HORIZON"
