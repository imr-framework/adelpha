"""Simulated MRI scanner adapter for simulation-first development."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone
from uuid import uuid4

import numpy as np

from dtam.config.models import ScannerProfile, SensorChannelConfig
from dtam.core.exceptions import (
    AcquisitionError,
    ConfigurationError,
    SensorUnavailableError,
)
from dtam.domain.entities.scanner import (
    ActuatorDescriptor,
    ScannerCapabilities,
    ScannerIdentity,
    SensorDescriptor,
    SensorKind,
)
from dtam.domain.measurements import (
    Measurement,
    MeasurementBatch,
    Provenance,
    QuantityKind,
    ValidityStatus,
)
from dtam.domain.modes import OperationalMode
from dtam.scanner_adapters.base import ScannerAdapter


class SimulatedScannerAdapter(ScannerAdapter):
    """
    Virtual scanner that generates typed measurements from a scanner profile.

    Supports temperature, EMI (RMS), and RF noise-floor channels for the
    Phase-2b acquisition / twin slice.
    """

    def __init__(
        self,
        profile: ScannerProfile,
        *,
        mode: OperationalMode = OperationalMode.SIMULATION,
        seed: int | None = 42,
    ) -> None:
        self._profile = profile
        self._mode = mode
        self._connected = False
        self._rng = np.random.default_rng(seed)
        self._temperatures_c = self._initial_temperatures(profile)
        self._emi_rms_v = self._initial_scalar_state(profile, SensorKind.EMI)
        self._rf_noise_dbm_hz = self._initial_scalar_state(profile, SensorKind.RF)
        self._center_frequency_hz: float | None = None
        field_t = profile.field_strength_t
        self._nominal_frequency_hz = 42_577_478.92 * field_t

    @staticmethod
    def _initial_temperatures(profile: ScannerProfile) -> dict[str, float]:
        temps = dict(profile.simulation.temperatures_c)
        for sensor in profile.sensors:
            if sensor.kind is SensorKind.TEMPERATURE and sensor.sensor_id not in temps:
                if sensor.nominal_value is not None:
                    temps[sensor.sensor_id] = sensor.nominal_value
                else:
                    temps[sensor.sensor_id] = profile.simulation.ambient_temperature_c
        return temps

    @staticmethod
    def _initial_scalar_state(
        profile: ScannerProfile,
        kind: SensorKind,
    ) -> dict[str, float]:
        values: dict[str, float] = {}
        for sensor in profile.sensors:
            if sensor.kind is kind:
                values[sensor.sensor_id] = (
                    float(sensor.nominal_value)
                    if sensor.nominal_value is not None
                    else 0.0
                )
        return values

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
        self._connected = True

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
        if action_type in self._profile.supported_actions:
            return True
        capability_aliases = {
            "set_center_frequency": "frequency_compensation",
            "frequency_compensation": "frequency_compensation",
            "switch_rf_tuning_relay": "rf_tuning_control",
        }
        capability = capability_aliases.get(action_type)
        return bool(capability and self.capabilities.supports(capability))

    def set_temperature_c(self, sensor_id: str, temperature_c: float) -> None:
        """Test/scenario helper to inject a deterministic thermal state."""
        if sensor_id not in self._temperatures_c:
            raise SensorUnavailableError(
                f"Unknown temperature sensor: {sensor_id}",
                scanner_id=self.scanner_id,
                context={"sensor_id": sensor_id},
            )
        self._temperatures_c[sensor_id] = temperature_c

    def get_temperature_c(self, sensor_id: str) -> float:
        try:
            return self._temperatures_c[sensor_id]
        except KeyError as exc:
            raise SensorUnavailableError(
                f"Unknown temperature sensor: {sensor_id}",
                scanner_id=self.scanner_id,
                context={"sensor_id": sensor_id},
            ) from exc

    def set_emi_rms_v(self, sensor_id: str, rms_v: float) -> None:
        if sensor_id not in self._emi_rms_v:
            raise SensorUnavailableError(
                f"Unknown EMI sensor: {sensor_id}",
                scanner_id=self.scanner_id,
                context={"sensor_id": sensor_id},
            )
        self._emi_rms_v[sensor_id] = rms_v

    def set_rf_noise_dbm_hz(self, sensor_id: str, noise_dbm_hz: float) -> None:
        if sensor_id not in self._rf_noise_dbm_hz:
            raise SensorUnavailableError(
                f"Unknown RF noise sensor: {sensor_id}",
                scanner_id=self.scanner_id,
                context={"sensor_id": sensor_id},
            )
        self._rf_noise_dbm_hz[sensor_id] = noise_dbm_hz

    def read_measurements(
        self,
        channel_ids: Sequence[str] | None = None,
    ) -> MeasurementBatch:
        if not self._connected:
            raise AcquisitionError(
                "Cannot read measurements before connect().",
                scanner_id=self.scanner_id,
                recommended_response="Call connect() on the scanner adapter first.",
            )

        now = datetime.now(timezone.utc)
        selected = list(channel_ids) if channel_ids is not None else [
            sensor.sensor_id for sensor in self._profile.sensors
        ]
        sensors_by_id = {s.sensor_id: s for s in self._profile.sensors}
        measurements: list[Measurement] = []

        for sensor_id in selected:
            sensor = sensors_by_id.get(sensor_id)
            if sensor is None:
                raise SensorUnavailableError(
                    f"Sensor channel is not defined on this scanner: {sensor_id}",
                    scanner_id=self.scanner_id,
                    context={"sensor_id": sensor_id},
                )
            measurements.append(self._synthesize(sensor, now))

        return MeasurementBatch(
            measurements=measurements,
            window_start=now,
            window_end=now,
            correlation_id=str(uuid4()),
            scanner_id=self.scanner_id,
        )

    def _synthesize(
        self,
        sensor: SensorChannelConfig,
        now: datetime,
    ) -> Measurement:
        if sensor.kind is SensorKind.TEMPERATURE:
            true_value = self._temperatures_c[sensor.sensor_id]
            noise_std = (
                sensor.noise_std
                if sensor.noise_std > 0
                else self._profile.simulation.temperature_noise_std_c
            )
            quantity = QuantityKind.TEMPERATURE
            metadata: dict[str, float] = {"true_value": true_value}
        elif sensor.kind is SensorKind.EMI:
            true_value = self._emi_rms_v[sensor.sensor_id]
            noise_std = sensor.noise_std
            quantity = QuantityKind.EMI_FIELD_RMS
            peak = float(
                self._profile.metadata.get("emi_peak_frequency_hz", 50_000.0)
            )
            metadata = {"true_value": true_value, "peak_frequency_hz": peak}
        elif sensor.kind is SensorKind.RF:
            true_value = self._rf_noise_dbm_hz[sensor.sensor_id]
            noise_std = sensor.noise_std
            quantity = QuantityKind.RF_NOISE_FLOOR
            bw = float(
                self._profile.metadata.get("rf_noise_bandwidth_hz", 100_000.0)
            )
            metadata = {"true_value": true_value, "bandwidth_hz": bw}
        else:
            raise AcquisitionError(
                f"Simulated read not implemented for sensor kind {sensor.kind}.",
                scanner_id=self.scanner_id,
                context={"sensor_id": sensor.sensor_id, "kind": sensor.kind.value},
                recommended_response=(
                    "Extend SimulatedScannerAdapter or filter to supported "
                    "temperature / EMI / RF channels."
                ),
            )

        noise = float(self._rng.normal(0.0, noise_std)) if noise_std else 0.0
        value = true_value + noise
        return Measurement(
            measurement_id=str(uuid4()),
            sensor_id=sensor.sensor_id,
            scanner_id=self.scanner_id,
            timestamp=now,
            quantity=quantity,
            value=value,
            unit=sensor.unit,
            calibration_version="sim-v1",
            uncertainty=noise_std,
            acquisition_quality=1.0,
            validity=ValidityStatus.VALID,
            provenance=Provenance(
                source="simulated_scanner",
                method="virtual_sensor",
                version="0.1.0",
            ),
            metadata=metadata,
        )


def create_simulated_scanner(
    profile: ScannerProfile,
    *,
    mode: OperationalMode = OperationalMode.SIMULATION,
    seed: int | None = 42,
    connect: bool = True,
) -> SimulatedScannerAdapter:
    is_virtual = (
        profile.id == "simulated_scanner"
        or profile.architecture.startswith("virtual")
        or profile.metadata.get("role") == "development_virtual_scanner"
    )
    if not is_virtual:
        raise ConfigurationError(
            "Refusing to create SimulatedScannerAdapter for a non-virtual profile.",
            scanner_id=profile.id,
            context={"architecture": profile.architecture},
        )
    adapter = SimulatedScannerAdapter(profile, mode=mode, seed=seed)
    if connect:
        adapter.connect()
    return adapter
