"""RF noise-floor state estimator."""

from __future__ import annotations

from dtam.digital_twin.state.common import QuantitySource, TimestampedQuantity
from dtam.digital_twin.state.rf_state import RfState
from dtam.domain.measurements import MeasurementBatch, QuantityKind


class RfNoiseEstimator:
    """Aggregate RF noise-floor channels into an RF twin state."""

    def __init__(self, *, model_version: str = "rf_noise_estimator-v1") -> None:
        self.model_version = model_version

    def estimate(self, batch: MeasurementBatch) -> RfState | None:
        rf_meas = [
            m
            for m in batch.usable()
            if m.quantity is QuantityKind.RF_NOISE_FLOOR
        ]
        if not rf_meas:
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
            for m in sorted(rf_meas, key=lambda x: x.sensor_id)
        ]
        mean_noise = sum(m.value for m in rf_meas) / len(rf_meas)
        bandwidth = next(
            (
                float(m.metadata["bandwidth_hz"])
                for m in rf_meas
                if "bandwidth_hz" in m.metadata
            ),
            None,
        )
        # Simple SNR proxy vs a quiet floor of -145 dBm/Hz (simulation heuristic).
        snr = mean_noise - (-145.0)

        return RfState(
            timestamp=now,
            scanner_id=batch.scanner_id,
            channels=channels,
            noise_floor_dbm_per_hz=TimestampedQuantity(
                value=mean_noise,
                unit="dBm/Hz",
                source=QuantitySource.ESTIMATED,
                timestamp=now,
                confidence=0.85,
                model_version=self.model_version,
            ),
            snr_estimate_db=TimestampedQuantity(
                value=snr,
                unit="dB",
                source=QuantitySource.ESTIMATED,
                timestamp=now,
                confidence=0.6,
                model_version=self.model_version,
            ),
            noise_bandwidth_hz=bandwidth,
            measurement_window_start=batch.window_start,
            measurement_window_end=batch.window_end,
            correlation_id=batch.correlation_id,
            model_version=self.model_version,
        )
