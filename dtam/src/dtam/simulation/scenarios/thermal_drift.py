"""Thermal-drift scenario for simulated scanners."""

from __future__ import annotations

from dataclasses import dataclass

from dtam.scanner_adapters.simulated_scanner import SimulatedScannerAdapter
from dtam.simulation.thermal.model import ThermalPlantModel


@dataclass(frozen=True)
class ThermalDriftScenario:
    """Raise magnet temperatures over time to exercise the B0 twin."""

    delta_c_per_step: float = 0.5
    steps: int = 5
    dt_s: float = 10.0
    name: str = "thermal_drift"

    def run(self, adapter: SimulatedScannerAdapter) -> list[dict[str, float]]:
        """Apply stepwise magnet heating and return temperature snapshots."""
        from dtam.domain.entities.scanner import SensorKind

        temp_sensors = [
            sensor
            for sensor in adapter.list_sensors()
            if sensor.kind is SensorKind.TEMPERATURE
        ]
        plant = ThermalPlantModel(
            {
                sensor.sensor_id: adapter.get_temperature_c(sensor.sensor_id)
                for sensor in temp_sensors
            },
            ambient_c=adapter.profile.simulation.ambient_temperature_c,
            tau_s=max(self.dt_s / 2.0, 1.0),
        )
        history: list[dict[str, float]] = []
        for _ in range(self.steps):
            plant.apply_uniform_magnet_drift(self.delta_c_per_step)
            snapshot = plant.step(self.dt_s)
            for channel_id, temperature_c in snapshot.items():
                if channel_id.startswith("temp_magnet") or channel_id == "temp_room_01":
                    adapter.set_temperature_c(channel_id, temperature_c)
            history.append(dict(snapshot))
        return history
