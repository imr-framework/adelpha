"""Placeholder physical adapter for the 48 mT Halbach system.

Phase 1 uses ``SimulatedScannerAdapter`` for closed-loop development.
This module only exposes the validated profile and capabilities so that
agents can reason about the real scanner without touching hardware.
"""

from __future__ import annotations

from collections.abc import Sequence

from dtam.config.models import ScannerProfile
from dtam.core.exceptions import ConfigurationError
from dtam.domain.entities.scanner import (
    ActuatorDescriptor,
    ScannerCapabilities,
    ScannerIdentity,
    SensorDescriptor,
)
from dtam.domain.measurements import MeasurementBatch
from dtam.domain.modes import OperationalMode
from dtam.scanner_adapters.base import ScannerAdapter
from dtam.scanner_adapters.halbach_48mt.capabilities import load_halbach_48mt_profile


class Halbach48mTAdapter(ScannerAdapter):
    """Profile-backed adapter that does not open physical device connections yet."""

    def __init__(self, profile: ScannerProfile | None = None) -> None:
        self._profile = profile or load_halbach_48mt_profile()
        self._mode = OperationalMode.READ_ONLY
        self._connected = False

    @property
    def identity(self) -> ScannerIdentity:
        return ScannerIdentity(
            scanner_id=self._profile.id,
            field_strength_t=self._profile.field_strength_t,
            architecture=self._profile.architecture,
            display_name=self._profile.display_name,
        )

    @property
    def profile(self) -> ScannerProfile:
        return self._profile

    @property
    def capabilities(self) -> ScannerCapabilities:
        return self._profile.capabilities

    def connect(self) -> None:
        raise ConfigurationError(
            "Physical Halbach48mTAdapter connectivity is not enabled in Phase 1.",
            scanner_id=self.scanner_id,
            recommended_response=(
                "Use SimulatedScannerAdapter for development, or wait for Phase 6 "
                "physical acquisition."
            ),
        )

    def disconnect(self) -> None:
        self._connected = False

    @property
    def is_connected(self) -> bool:
        return self._connected

    def get_mode(self) -> OperationalMode:
        return self._mode

    def set_mode(self, mode: OperationalMode) -> None:
        self._mode = mode

    def list_sensors(self) -> list[SensorDescriptor]:
        return [
            SensorDescriptor(
                sensor_id=sensor.sensor_id,
                kind=sensor.kind,
                unit=sensor.unit,
                description=sensor.description,
                sampling_rate_hz=sensor.sampling_rate_hz,
                location=sensor.location,
            )
            for sensor in self._profile.sensors
        ]

    def list_actuators(self) -> list[ActuatorDescriptor]:
        return [
            ActuatorDescriptor(
                actuator_id=actuator.actuator_id,
                kind=actuator.kind,
                description=actuator.description,
                reversible=actuator.reversible,
            )
            for actuator in self._profile.actuators
        ]

    def supports_action(self, action_type: str) -> bool:
        return action_type in self._profile.supported_actions

    def read_measurements(
        self,
        channel_ids: Sequence[str] | None = None,
    ) -> MeasurementBatch:
        raise ConfigurationError(
            "Physical measurement acquisition is not enabled for Halbach48mTAdapter.",
            scanner_id=self.scanner_id,
            context={"channel_ids": list(channel_ids) if channel_ids else None},
            recommended_response="Use SimulatedScannerAdapter during Phase 1–5.",
        )
