"""Configuration loader tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from dtam.config.loader import (
    deep_merge,
    load_runtime_settings,
    load_scanner_profile,
)
from dtam.core.exceptions import ConfigurationError
from dtam.domain.modes import OperationalMode


def test_deep_merge_overrides_nested_keys() -> None:
    base = {"a": 1, "nested": {"x": 1, "y": 2}}
    override = {"nested": {"y": 9}, "b": 3}
    assert deep_merge(base, override) == {"a": 1, "nested": {"x": 1, "y": 9}, "b": 3}


def test_load_simulated_scanner_profile(config_root: Path) -> None:
    profile = load_scanner_profile(config_root, "simulated_scanner")
    assert profile.id == "simulated_scanner"
    assert profile.field_strength_t == pytest.approx(0.048)
    assert profile.capabilities.temperature_monitoring is True
    assert profile.capabilities.automatic_control is False
    assert len(profile.sensors) >= 3
    assert "set_center_frequency" in profile.supported_actions


def test_load_halbach_profile_uses_scanner_wrapper(config_root: Path) -> None:
    profile = load_scanner_profile(config_root, "halbach_48mt")
    assert profile.id == "halbach_48mt"
    assert profile.architecture == "permanent_magnet_halbach"
    assert profile.capabilities.emi_monitoring is True
    assert profile.capabilities.active_shimming is False


def test_runtime_settings_respect_environment_overrides(config_root: Path) -> None:
    settings = load_runtime_settings(
        environment="testing",
        config_root=config_root,
    )
    assert settings.app.environment == "testing"
    assert settings.mode is OperationalMode.SIMULATION
    assert settings.scanner.id == "simulated_scanner"
    assert settings.app.logging.level == "WARNING"


def test_missing_scanner_profile_raises(config_root: Path) -> None:
    with pytest.raises(ConfigurationError):
        load_scanner_profile(config_root, "does_not_exist")
