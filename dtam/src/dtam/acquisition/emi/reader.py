"""EMI acquisition facade over ScannerAdapter."""

from __future__ import annotations

from collections.abc import Sequence

from dtam.domain.measurements import MeasurementBatch, QuantityKind
from dtam.scanner_adapters.base import ScannerAdapter


def read_emi_batch(
    adapter: ScannerAdapter,
    channel_ids: Sequence[str] | None = None,
) -> MeasurementBatch:
    """Read EMI RMS channels from the adapter batch."""
    batch = adapter.read_measurements(channel_ids=channel_ids)
    emi = [m for m in batch.measurements if m.quantity is QuantityKind.EMI_FIELD_RMS]
    return MeasurementBatch(
        measurements=emi,
        window_start=batch.window_start,
        window_end=batch.window_end,
        correlation_id=batch.correlation_id,
        scanner_id=batch.scanner_id,
    )
