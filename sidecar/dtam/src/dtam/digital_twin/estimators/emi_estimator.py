"""EMI state estimator from adapter measurements."""

from __future__ import annotations

from dtam.digital_twin.state.common import QuantitySource, TimestampedQuantity
from dtam.digital_twin.state.emi_state import EmiState
from dtam.domain.measurements import MeasurementBatch, QuantityKind


def _classify_label(peak_frequency_hz: float, rms: float) -> str:
    if peak_frequency_hz > 1_000.0 and rms > 0.005:
        return "narrowband"
    if rms < 0.002:
        return "nominal"
    return "broadband"


class EmiEstimator:
    """Aggregate EMI RMS channels into an EMI twin state."""

    def __init__(self, *, model_version: str = "emi_estimator-v1") -> None:
        self.model_version = model_version

    def estimate(self, batch: MeasurementBatch) -> EmiState | None:
        emi_meas = [
            m
            for m in batch.usable()
            if m.quantity is QuantityKind.EMI_FIELD_RMS
        ]
        if not emi_meas:
            return None

        now = batch.window_end
        channels = [
            TimestampedQuantity(
                value=m.value,
                unit=m.unit,
                source=QuantitySource.MEASURED,
                timestamp=m.timestamp,
                uncertainty_std=m.uncertainty,
                channel_id=m.sensor_id,
                model_version=self.model_version,
            )
            for m in sorted(emi_meas, key=lambda x: x.sensor_id)
        ]
        rms_mean = sum(m.value for m in emi_meas) / len(emi_meas)
        peak = next(
            (
                float(m.metadata["peak_frequency_hz"])
                for m in emi_meas
                if "peak_frequency_hz" in m.metadata
            ),
            None,
        )
        label = (
            _classify_label(peak, rms_mean) if peak is not None else None
        )

        return EmiState(
            timestamp=now,
            scanner_id=batch.scanner_id,
            channels=channels,
            rms_v=TimestampedQuantity(
                value=rms_mean,
                unit="V",
                source=QuantitySource.ESTIMATED,
                timestamp=now,
                confidence=0.85,
                model_version=self.model_version,
            ),
            peak_frequency_hz=(
                TimestampedQuantity(
                    value=peak,
                    unit="Hz",
                    source=QuantitySource.ESTIMATED,
                    timestamp=now,
                    confidence=0.8,
                    model_version=self.model_version,
                )
                if peak is not None
                else None
            ),
            classification_label=label,
            measurement_window_start=batch.window_start,
            measurement_window_end=batch.window_end,
            correlation_id=batch.correlation_id,
            model_version=self.model_version,
        )
