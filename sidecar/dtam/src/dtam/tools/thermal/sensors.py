"""Temperature channel acquisition tools."""

from __future__ import annotations

from typing import Any

from dtam.config.loader import load_runtime_settings
from dtam.memory.working import WORKING_STATE
from dtam.scanner_adapters import create_scanner_adapter
from dtam.tools.base import error_result, ok_result


def read_temperature_channels(scanner_id: str = "simulated_scanner") -> dict[str, Any]:
    """Read temperature channels via the configured scanner adapter."""
    try:
        settings = load_runtime_settings(
            scanner_id=scanner_id,
            environment="testing",
        )
        adapter = create_scanner_adapter(settings)
        if not adapter.is_connected:
            adapter.connect()
        batch = adapter.read_measurements()
    except Exception as exc:  # noqa: BLE001 - surface as tool error
        return error_result(
            "read_temperature_channels",
            str(exc),
            error_code="TEMPERATURE_READ_FAILED",
            scanner_id=scanner_id,
        )

    channels = [
        {
            "sensor_id": m.sensor_id,
            "value": m.value,
            "unit": m.unit,
            "validity": m.validity.value,
            "timestamp": m.timestamp.isoformat(),
        }
        for m in batch.measurements
        if m.quantity.value == "temperature"
    ]
    WORKING_STATE.set("thermal.last_batch_correlation_id", batch.correlation_id)
    WORKING_STATE.set("thermal.last_channels", channels)
    return ok_result(
        "read_temperature_channels",
        scanner_id=scanner_id,
        correlation_id=batch.correlation_id,
        channels=channels,
    )
