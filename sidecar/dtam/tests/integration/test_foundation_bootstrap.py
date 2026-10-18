"""Foundation bootstrap integration test."""

from __future__ import annotations

from pathlib import Path

from dtam.bootstrap import bootstrap
from dtam.domain.modes import OperationalMode
from dtam.scanner_adapters import create_scanner_adapter


def test_bootstrap_simulated_scanner(config_root: Path) -> None:
    app = bootstrap(
        scanner_id="simulated_scanner",
        environment="testing",
        config_root=config_root,
    )
    assert app.adapter.scanner_id == "simulated_scanner"
    assert app.adapter.is_connected
    assert app.adapter.get_mode() is OperationalMode.SIMULATION
    assert app.settings.scanner.capabilities.automatic_control is False

    batch = app.adapter.read_measurements()
    assert len(batch.usable()) >= 3
    assert batch.correlation_id


def test_factory_selects_halbach_profile_without_connecting(config_root: Path) -> None:
    from dtam.config.loader import load_runtime_settings

    settings = load_runtime_settings(
        scanner_id="halbach_48mt",
        environment="testing",
        config_root=config_root,
    )
    adapter = create_scanner_adapter(settings)
    assert adapter.scanner_id == "halbach_48mt"
    assert not adapter.is_connected
