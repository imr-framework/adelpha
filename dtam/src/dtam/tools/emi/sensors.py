"""EMI sensor summary tools."""

from __future__ import annotations

from typing import Any

from dtam.acquisition.emi import read_emi_batch
from dtam.config.loader import load_runtime_settings
from dtam.memory.working import WORKING_STATE
from dtam.scanner_adapters import create_scanner_adapter
from dtam.tools.base import error_result, ok_result


def read_emi_sensor_summary(
    scanner_id: str = "simulated_scanner",
) -> dict[str, Any]:
    """Read EMI probe channels via the configured scanner adapter."""
    try:
        settings = load_runtime_settings(
            scanner_id=scanner_id,
            environment="testing",
        )
        adapter = create_scanner_adapter(settings)
        if not adapter.is_connected:
            adapter.connect()
        batch = read_emi_batch(adapter)
    except Exception as exc:  # noqa: BLE001
        return error_result(
            "read_emi_sensor_summary",
            str(exc),
            error_code="EMI_READ_FAILED",
            scanner_id=scanner_id,
        )

    if not batch.measurements:
        return error_result(
            "read_emi_sensor_summary",
            "No EMI channels available on this scanner.",
            error_code="EMI_CHANNELS_MISSING",
            scanner_id=scanner_id,
        )

    channels = []
    peak_hz: float | None = None
    for m in batch.measurements:
        peak = m.metadata.get("peak_frequency_hz")
        if peak is not None:
            peak_hz = float(peak)
        channels.append(
            {
                "sensor_id": m.sensor_id,
                "rms": m.value,
                "unit": m.unit,
                "validity": m.validity.value,
                "timestamp": m.timestamp.isoformat(),
                "peak_frequency_hz": peak,
            }
        )
    rms_mean = sum(m.value for m in batch.measurements) / len(batch.measurements)
    WORKING_STATE.set("emi.last_batch_correlation_id", batch.correlation_id)
    WORKING_STATE.set("emi.last_channels", channels)
    return ok_result(
        "read_emi_sensor_summary",
        scanner_id=scanner_id,
        correlation_id=batch.correlation_id,
        rms=rms_mean,
        peak_frequency_hz=peak_hz,
        channels=channels,
        source="scanner_adapter",
    )
