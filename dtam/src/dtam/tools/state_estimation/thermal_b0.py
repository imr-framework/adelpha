"""State-estimation tools for the multi-subsystem twin."""

from __future__ import annotations

import json
from typing import Any

from dtam.config.loader import load_runtime_settings
from dtam.digital_twin.models.thermal import ThermalToB0Params
from dtam.digital_twin.service import ThermalMagneticTwin, TwinConfig
from dtam.scanner_adapters import create_scanner_adapter
from dtam.tools.base import error_result, ok_result


def _run_twin_update(
    *,
    scanner_id: str,
    predict_horizon_s: float,
    magnet_heating_rate_c_per_s: float,
    magnet_setpoint_c: float,
    alpha_t_tesla_per_c: float,
) -> Any:
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
    horizon = predict_horizon_s if predict_horizon_s > 0 else None
    setpoint = magnet_setpoint_c if magnet_setpoint_c != 0.0 else None
    return twin.update(
        batch,
        predict_horizon_s=horizon,
        magnet_heating_rate_c_per_s=magnet_heating_rate_c_per_s,
        magnet_setpoint_c=setpoint,
    )


def estimate_thermal_b0_state(
    scanner_id: str = "simulated_scanner",
    predict_horizon_s: float = 0.0,
    magnet_heating_rate_c_per_s: float = 0.0,
    magnet_setpoint_c: float = 0.0,
    alpha_t_tesla_per_c: float = -5.0e-5,
) -> dict[str, Any]:
    """Update twin and return thermal + B0 fields (legacy tool name)."""
    try:
        state = _run_twin_update(
            scanner_id=scanner_id,
            predict_horizon_s=predict_horizon_s,
            magnet_heating_rate_c_per_s=magnet_heating_rate_c_per_s,
            magnet_setpoint_c=magnet_setpoint_c,
            alpha_t_tesla_per_c=alpha_t_tesla_per_c,
        )
    except Exception as exc:  # noqa: BLE001
        return error_result(
            "estimate_thermal_b0_state",
            str(exc),
            error_code="TWIN_UPDATE_FAILED",
            scanner_id=scanner_id,
        )
    return _thermal_b0_payload("estimate_thermal_b0_state", state)


def estimate_twin_state(
    scanner_id: str = "simulated_scanner",
    predict_horizon_s: float = 0.0,
    magnet_heating_rate_c_per_s: float = 0.0,
    magnet_setpoint_c: float = 0.0,
    alpha_t_tesla_per_c: float = -5.0e-5,
) -> dict[str, Any]:
    """Update twin and return thermal, B0, EMI, and RF noise fields."""
    try:
        state = _run_twin_update(
            scanner_id=scanner_id,
            predict_horizon_s=predict_horizon_s,
            magnet_heating_rate_c_per_s=magnet_heating_rate_c_per_s,
            magnet_setpoint_c=magnet_setpoint_c,
            alpha_t_tesla_per_c=alpha_t_tesla_per_c,
        )
    except Exception as exc:  # noqa: BLE001
        return error_result(
            "estimate_twin_state",
            str(exc),
            error_code="TWIN_UPDATE_FAILED",
            scanner_id=scanner_id,
        )

    payload = _thermal_b0_payload("estimate_twin_state", state)
    data = payload["data"]
    emi = state.emi
    rf = state.rf
    data["emi_rms_v"] = emi.rms_v.value if emi and emi.rms_v else None
    data["emi_peak_frequency_hz"] = (
        emi.peak_frequency_hz.value if emi and emi.peak_frequency_hz else None
    )
    data["emi_classification_label"] = (
        emi.classification_label if emi else None
    )
    data["rf_noise_floor_dbm_per_hz"] = (
        rf.noise_floor_dbm_per_hz.value
        if rf and rf.noise_floor_dbm_per_hz
        else None
    )
    data["rf_noise_bandwidth_hz"] = rf.noise_bandwidth_hz if rf else None
    data["twin_version"] = state.twin_version
    return payload


def _thermal_b0_payload(tool: str, state: Any) -> dict[str, Any]:
    thermal = state.thermal
    magnetic = state.magnetic
    mean_t = (
        thermal.mean_magnet_temperature_c.value
        if thermal and thermal.mean_magnet_temperature_c
        else None
    )
    delta_t = (
        thermal.delta_magnet_temperature_c.value
        if thermal and thermal.delta_magnet_temperature_c
        else None
    )
    predicted_mean_t = (
        thermal.predicted_mean_magnet_temperature_c.value
        if thermal and thermal.predicted_mean_magnet_temperature_c
        else None
    )
    b0 = magnetic.b0_t.value if magnetic and magnetic.b0_t else None
    delta_b0 = (
        magnetic.delta_b0_t.value if magnetic and magnetic.delta_b0_t else None
    )
    f0_mhz = (
        magnetic.resonant_frequency_mhz.value
        if magnetic and magnetic.resonant_frequency_mhz
        else None
    )
    predicted_b0 = (
        magnetic.predicted_b0_t.value
        if magnetic and magnetic.predicted_b0_t
        else None
    )
    return ok_result(
        tool,
        scanner_id=state.scanner_id,
        correlation_id=state.correlation_id,
        mean_magnet_temperature_c=mean_t,
        delta_magnet_temperature_c=delta_t,
        predicted_mean_magnet_temperature_c=predicted_mean_t,
        b0_t=b0,
        delta_b0_t=delta_b0,
        resonant_frequency_mhz=f0_mhz,
        predicted_b0_t=predicted_b0,
        notes=state.notes,
        snapshot_json=json.loads(state.model_dump_json()),
    )

