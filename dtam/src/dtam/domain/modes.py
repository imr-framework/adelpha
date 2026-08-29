"""Operational modes for DTAM deployments."""

from enum import Enum


class OperationalMode(str, Enum):
    """Explicit runtime modes. Physical mutations are rejected in several modes."""

    SIMULATION = "simulation"
    READ_ONLY = "read_only"
    ADVISORY = "advisory"
    SUPERVISED_CONTROL = "supervised_control"
    AUTONOMOUS_CONTROL = "autonomous_control"
    EMERGENCY_STOP = "emergency_stop"
    MAINTENANCE = "maintenance"
    CALIBRATION = "calibration"

    def allows_physical_mutation(self) -> bool:
        """Whether mutating operations against physical hardware are permitted."""
        return self in {
            OperationalMode.SUPERVISED_CONTROL,
            OperationalMode.AUTONOMOUS_CONTROL,
            OperationalMode.MAINTENANCE,
            OperationalMode.CALIBRATION,
        }

    def allows_simulated_mutation(self) -> bool:
        """Whether mutating the virtual scanner is permitted."""
        return self in {
            OperationalMode.SIMULATION,
            OperationalMode.SUPERVISED_CONTROL,
            OperationalMode.AUTONOMOUS_CONTROL,
            OperationalMode.MAINTENANCE,
            OperationalMode.CALIBRATION,
        }
