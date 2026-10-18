"""Scanner adapter contracts shared by all MRI deployments."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

from dtam.config.models import ScannerProfile
from dtam.domain.entities.scanner import (
    ActuatorDescriptor,
    ScannerCapabilities,
    ScannerIdentity,
    SensorDescriptor,
)
from dtam.domain.measurements import MeasurementBatch
from dtam.domain.modes import OperationalMode


class ScannerAdapter(ABC):
    """
    Scanner-independent hardware/virtual interface.

    Adapters expose capabilities, sensors, and measurements. Agents must not
    talk to drivers directly; they go through tools that call adapters.
    """

    @property
    @abstractmethod
    def identity(self) -> ScannerIdentity:
        """Stable scanner identity metadata."""

    @property
    def scanner_id(self) -> str:
        return self.identity.scanner_id

    @property
    @abstractmethod
    def profile(self) -> ScannerProfile:
        """Validated configuration profile for this adapter."""

    @property
    @abstractmethod
    def capabilities(self) -> ScannerCapabilities:
        """Machine-readable capability flags."""

    @abstractmethod
    def connect(self) -> None:
        """Establish communication with the scanner or virtual backend."""

    @abstractmethod
    def disconnect(self) -> None:
        """Release resources and close communication channels."""

    @property
    @abstractmethod
    def is_connected(self) -> bool:
        """Whether the adapter currently has an active session."""

    @abstractmethod
    def get_mode(self) -> OperationalMode:
        """Return the active operational mode."""

    @abstractmethod
    def set_mode(self, mode: OperationalMode) -> None:
        """Update the operational mode subject to deployment policy."""

    @abstractmethod
    def list_sensors(self) -> list[SensorDescriptor]:
        """Return available sensor channels."""

    @abstractmethod
    def list_actuators(self) -> list[ActuatorDescriptor]:
        """Return available actuators."""

    @abstractmethod
    def supports_action(self, action_type: str) -> bool:
        """Whether the adapter declares support for an intervention type."""

    @abstractmethod
    def read_measurements(
        self,
        channel_ids: Sequence[str] | None = None,
    ) -> MeasurementBatch:
        """Acquire a synchronized batch of measurements."""
