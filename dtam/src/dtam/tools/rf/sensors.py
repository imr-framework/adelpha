"""RF noise-floor sensor tools."""

from __future__ import annotations

from typing import Any

from dtam.acquisition.rf import read_rf_noise_batch
from dtam.config.loader import load_runtime_settings
from dtam.memory.working import WORKING_STATE
from dtam.scanner_adapters import create_scanner_adapter
from dtam.tools.base import error_result, ok_result


def read_rf_noise_channels(scanner_id: str = "simulated_scanner") -> dict[str, Any]:
    """Read RF noise-floor channels via the configured scanner adapter."""
    try:
        settings = load_runtime_settings(
            scanner_id=scanner_id,
            environment="testing",
        )
        adapter = create_scanner_adapter(settings)
        if not adapter.is_connected:
            adapter.connect()
        batch = read_rf_noise_batch(adapter)
    except Exception as exc:  # noqa: BLE001
        return error_result(
            "read_rf_noise_channels",
            str(exc),
            error_code="RF_NOISE_READ_FAILED",
            scanner_id=scanner_id,
        )

    if not batch.measurements:
        return error_result(
            "read_rf_noise_channels",
            "No RF noise channels available on this scanner.",
            error_code="RF_NOISE_CHANNELS_MISSING",
            scanner_id=scanner_id,
        )

    channels = []
    bandwidth_hz: float | None = None
    for m in batch.measurements:
        bw = m.metadata.get("bandwidth_hz")
        if bw is not None:
            bandwidth_hz = float(bw)
        channels.append(
            {
                "sensor_id": m.sensor_id,
                "noise_floor_dbm_per_hz": m.value,
                "unit": m.unit,
                "validity": m.validity.value,
                "timestamp": m.timestamp.isoformat(),
                "bandwidth_hz": bw,
            }
        )
    mean_noise = sum(m.value for m in batch.measurements) / len(batch.measurements)
    WORKING_STATE.set("rf.last_batch_correlation_id", batch.correlation_id)
    WORKING_STATE.set("rf.last_channels", channels)
    return ok_result(
        "read_rf_noise_channels",
        scanner_id=scanner_id,
        correlation_id=batch.correlation_id,
        noise_floor_dbm_per_hz=mean_noise,
        bandwidth_hz=bandwidth_hz,
        channels=channels,
        source="scanner_adapter",
    )
