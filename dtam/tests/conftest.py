"""Shared pytest fixtures for DTAM tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from dtam.bootstrap import DtamApp, bootstrap
from dtam.config.loader import load_runtime_settings
from dtam.config.models import RuntimeSettings
from dtam.domain.modes import OperationalMode
from dtam.scanner_adapters.simulated_scanner import SimulatedScannerAdapter


@pytest.fixture
def config_root() -> Path:
    return Path(__file__).resolve().parents[1] / "configs"


@pytest.fixture
def runtime_settings(config_root: Path) -> RuntimeSettings:
    return load_runtime_settings(
        scanner_id="simulated_scanner",
        environment="testing",
        mode=OperationalMode.SIMULATION,
        config_root=config_root,
    )


@pytest.fixture
def simulated_adapter(runtime_settings: RuntimeSettings) -> SimulatedScannerAdapter:
    adapter = SimulatedScannerAdapter(
        runtime_settings.scanner,
        mode=OperationalMode.SIMULATION,
        seed=0,
    )
    adapter.connect()
    return adapter


@pytest.fixture
def app(config_root: Path) -> DtamApp:
    return bootstrap(
        scanner_id="simulated_scanner",
        environment="testing",
        config_root=config_root,
    )
