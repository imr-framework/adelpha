"""Common estimator interfaces."""

from __future__ import annotations

from typing import Protocol

from dtam.digital_twin.state.system_state import SystemState
from dtam.domain.measurements import MeasurementBatch


class StateEstimator(Protocol):
    """Interchangeable estimator contract for later Kalman / hybrid models."""

    def update(
        self,
        previous_state: SystemState | None,
        measurements: MeasurementBatch,
    ) -> SystemState:
        """Incorporate a measurement batch into a new twin snapshot."""
        ...
