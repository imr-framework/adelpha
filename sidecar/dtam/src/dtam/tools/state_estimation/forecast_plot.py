"""Multi-horizon twin forecast trajectories rendered as PNG plots."""

from __future__ import annotations

import base64
import io
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np

from dtam.config.loader import load_runtime_settings
from dtam.digital_twin.models.thermal import ThermalToB0Params
from dtam.digital_twin.service import ThermalMagneticTwin, TwinConfig
from dtam.scanner_adapters import create_scanner_adapter
from dtam.tools.base import error_result, ok_result
from dtam.tools.paths import artifacts_root


def _qty(value_obj: Any) -> float | None:
    if value_obj is None:
        return None
    return float(value_obj.value)


def _sample_forecast_series(
    *,
    scanner_id: str,
    predict_horizon_s: float,
    n_points: int,
    magnet_heating_rate_c_per_s: float,
    magnet_setpoint_c: float,
    alpha_t_tesla_per_c: float,
) -> tuple[list[dict[str, Any]], str, str]:
    """Return (series points, backend label, scanner_id from state)."""
    settings = load_runtime_settings(
        scanner_id=scanner_id,
        environment="testing",
    )
    adapter = create_scanner_adapter(settings)
    if not adapter.is_connected:
        adapter.connect()
    batch = adapter.read_measurements()
    twin = ThermalMagneticTwin(
        TwinConfig(
            nominal_b0_t=adapter.identity.field_strength_t,
            thermal_to_b0=ThermalToB0Params(
                alpha_t_tesla_per_c=alpha_t_tesla_per_c,
            ),
            mode=adapter.get_mode(),
        )
    )
    setpoint = magnet_setpoint_c if magnet_setpoint_c != 0.0 else None
    horizons = np.linspace(0.0, max(predict_horizon_s, 0.0), num=max(n_points, 2))
    series: list[dict[str, Any]] = []
    backend = "none"

    for horizon in horizons:
        h = float(horizon)
        state = twin.update(
            batch,
            predict_horizon_s=h if h > 0 else None,
            magnet_heating_rate_c_per_s=magnet_heating_rate_c_per_s,
            magnet_setpoint_c=setpoint,
        )
        thermal = state.thermal
        magnetic = state.magnetic
        for note in state.notes:
            if note.startswith("thermal_forecast="):
                backend = note.split("=", 1)[1]
        series.append(
            {
                "t_s": h,
                "mean_magnet_temperature_c": _qty(
                    thermal.mean_magnet_temperature_c if thermal else None
                ),
                "predicted_mean_magnet_temperature_c": _qty(
                    thermal.predicted_mean_magnet_temperature_c if thermal else None
                ),
                "b0_t": _qty(magnetic.b0_t if magnetic else None),
                "predicted_b0_t": _qty(
                    magnetic.predicted_b0_t if magnetic else None
                ),
                "resonant_frequency_mhz": _qty(
                    magnetic.resonant_frequency_mhz if magnetic else None
                ),
                "predicted_frequency_mhz": _qty(
                    magnetic.predicted_frequency_mhz if magnetic else None
                ),
            }
        )

    if backend == "none" and predict_horizon_s > 0:
        backend = "pinn" if twin.thermal_forecast.pinn_available else "linear_rate"
    return series, backend, adapter.scanner_id


def _render_forecast_png(series: list[dict[str, Any]], *, caption: str) -> bytes:
    t = np.array([p["t_s"] for p in series], dtype=float)
    t_meas = np.array(
        [p["mean_magnet_temperature_c"] for p in series], dtype=float
    )
    t_pred = np.array(
        [
            p["predicted_mean_magnet_temperature_c"]
            if p["predicted_mean_magnet_temperature_c"] is not None
            else np.nan
            for p in series
        ],
        dtype=float,
    )
    f_est = np.array(
        [
            p["resonant_frequency_mhz"]
            if p["resonant_frequency_mhz"] is not None
            else np.nan
            for p in series
        ],
        dtype=float,
    )
    f_pred = np.array(
        [
            p["predicted_frequency_mhz"]
            if p["predicted_frequency_mhz"] is not None
            else np.nan
            for p in series
        ],
        dtype=float,
    )

    fig, (ax_t, ax_f) = plt.subplots(2, 1, figsize=(7.5, 6.0), sharex=True)
    ax_t.plot(t, t_meas, "o-", color="#1f4e79", label="measured / estimated mean T")
    if np.any(~np.isnan(t_pred)):
        ax_t.plot(t, t_pred, "s--", color="#c45911", label="predicted mean T")
    ax_t.set_ylabel("Magnet temperature (°C)")
    ax_t.set_title(caption)
    ax_t.grid(True, alpha=0.35)
    ax_t.legend(loc="best", fontsize=8)

    ax_f.plot(t, f_est, "o-", color="#385723", label="estimated f0")
    if np.any(~np.isnan(f_pred)):
        ax_f.plot(t, f_pred, "s--", color="#833c0c", label="predicted f0")
    ax_f.set_xlabel("Horizon (s)")
    ax_f.set_ylabel("Resonant frequency (MHz)")
    ax_f.grid(True, alpha=0.35)
    ax_f.legend(loc="best", fontsize=8)

    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120)
    plt.close(fig)
    return buf.getvalue()


def plot_twin_forecast(
    scanner_id: str = "simulated_scanner",
    predict_horizon_s: float = 60.0,
    n_points: int = 9,
    magnet_heating_rate_c_per_s: float = 0.0,
    magnet_setpoint_c: float = 0.0,
    alpha_t_tesla_per_c: float = -5.0e-5,
) -> dict[str, Any]:
    """Sample a twin forecast trajectory and render a thermal + f0 PNG.

    Use for forecast / prediction questions. Returns series data plus a PNG
    (base64) for chat UIs. Predicted curves are not measurements.
    """
    if predict_horizon_s <= 0:
        return error_result(
            "plot_twin_forecast",
            "predict_horizon_s must be > 0 for a forecast plot",
            error_code="INVALID_HORIZON",
            scanner_id=scanner_id,
        )
    n = max(int(n_points), 2)
    try:
        series, backend, resolved_scanner = _sample_forecast_series(
            scanner_id=scanner_id,
            predict_horizon_s=predict_horizon_s,
            n_points=n,
            magnet_heating_rate_c_per_s=magnet_heating_rate_c_per_s,
            magnet_setpoint_c=magnet_setpoint_c,
            alpha_t_tesla_per_c=alpha_t_tesla_per_c,
        )
    except Exception as exc:  # noqa: BLE001
        return error_result(
            "plot_twin_forecast",
            str(exc),
            error_code="FORECAST_PLOT_FAILED",
            scanner_id=scanner_id,
        )

    caption = (
        f"Twin forecast ({backend}) · {resolved_scanner} · "
        f"horizon={predict_horizon_s:g}s"
    )
    png_bytes = _render_forecast_png(series, caption=caption)

    out_dir = artifacts_root() / "forecasts"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    filename = f"forecast_{resolved_scanner}_{stamp}.png"
    plot_path = out_dir / filename
    plot_path.write_bytes(png_bytes)

    rel_path = str(Path("artifacts") / "forecasts" / filename)
    return ok_result(
        "plot_twin_forecast",
        scanner_id=resolved_scanner,
        predict_horizon_s=predict_horizon_s,
        n_points=n,
        backend=backend,
        caption=caption,
        series=series,
        plot_path=rel_path,
        plot_filename=filename,
        mime_type="image/png",
        plot_png_base64=base64.b64encode(png_bytes).decode("ascii"),
    )
