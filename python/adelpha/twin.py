"""Digital-twin estimators, state, and bootstrap."""

from __future__ import annotations

import os
from pathlib import Path

from dtam.bootstrap import DtamApp
from dtam.digital_twin import (
    B0Estimator,
    EmiEstimator,
    EmiState,
    MagneticState,
    QuantitySource,
    ResonantFrequencyModel,
    RfNoiseEstimator,
    RfState,
    SystemState,
    ThermalEstimator,
    ThermalForecastService,
    ThermalMagneticTwin,
    ThermalState,
    ThermalToB0Model,
    ThermalToB0Params,
    TimestampedQuantity,
    TwinConfig,
)

TwinApp = DtamApp

__all__ = [
    "B0Estimator",
    "DtamApp",
    "EmiEstimator",
    "EmiState",
    "MagneticState",
    "QuantitySource",
    "ResonantFrequencyModel",
    "RfNoiseEstimator",
    "RfState",
    "SystemState",
    "ThermalEstimator",
    "ThermalForecastService",
    "ThermalMagneticTwin",
    "ThermalState",
    "ThermalToB0Model",
    "ThermalToB0Params",
    "TimestampedQuantity",
    "TwinApp",
    "TwinConfig",
    "bootstrap",
]


def _packaged_configs() -> Path | None:
    env = os.environ.get("ADELPHA_CONFIG_DIR") or os.environ.get("DTAM_CONFIG_DIR")
    if env:
        return Path(env).expanduser()
    packaged = Path(__file__).resolve().parent / "data" / "configs"
    if (packaged / "app.yaml").is_file():
        return packaged
    return None


def bootstrap(
    *,
    scanner_id: str | None = None,
    environment: str | None = None,
    mode=None,
    config_root: Path | str | None = None,
) -> DtamApp:
    """Load scanner configuration and create an adapter.

    Installed wheels use the packaged config tree unless ``config_root`` or
    ``ADELPHA_CONFIG_DIR`` / ``DTAM_CONFIG_DIR`` is set.
    """
    from dtam.bootstrap import bootstrap as _bootstrap

    root = config_root if config_root is not None else _packaged_configs()
    return _bootstrap(
        scanner_id=scanner_id,
        environment=environment,
        mode=mode,
        config_root=root,
    )
