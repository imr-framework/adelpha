"""Tests for twin SystemState → DigitalTwinObservation bridge."""

from __future__ import annotations

from pathlib import Path

from dtam.agents.core.adk_tools import assess_from_twin_scanner
from dtam.agents.core.twin_bridge import observation_from_system_state
from dtam.config.loader import load_runtime_settings
from dtam.digital_twin import ThermalMagneticTwin, TwinConfig
from dtam.domain.modes import OperationalMode
from dtam.scanner_adapters.simulated_scanner import SimulatedScannerAdapter


def test_observation_from_system_state(config_root: Path) -> None:
    settings = load_runtime_settings(
        scanner_id="simulated_scanner",
        environment="testing",
        mode=OperationalMode.SIMULATION,
        config_root=config_root,
    )
    adapter = SimulatedScannerAdapter(
        settings.scanner,
        mode=OperationalMode.SIMULATION,
        seed=0,
    )
    adapter.connect()
    twin = ThermalMagneticTwin(
        TwinConfig(
            nominal_b0_t=adapter.identity.field_strength_t,
            mode=adapter.get_mode(),
        )
    )
    state = twin.update(adapter.read_measurements())
    obs = observation_from_system_state(state)
    assert obs.thermal is not None
    assert obs.magnet is not None
    assert obs.emi is not None
    assert obs.magnet.nominal_field_t == adapter.identity.field_strength_t
    assert obs.magnet.center_frequency_hz is not None
    assert obs.magnet.center_frequency_hz > 1e6  # Hz, not MHz


def test_assess_from_twin_scanner() -> None:
    result = assess_from_twin_scanner(
        scanner_id="simulated_scanner",
        mode="observe",
    )
    assert result["ok"] is True
    assessment = result["data"]["assessment"]
    assert "activated_agents" in assessment
    assert assessment["overall_confidence"] >= 0.0


def test_assess_from_twin_scanner_rejects_scanner_mode() -> None:
    result = assess_from_twin_scanner(
        scanner_id="simulated_scanner",
        mode="simulation",
    )
    assert result["ok"] is False
    assert "observe" in result["error"]
