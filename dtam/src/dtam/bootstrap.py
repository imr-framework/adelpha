"""Application bootstrap: config, logging, and scanner adapter wiring."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from dtam.config.loader import load_runtime_settings
from dtam.config.models import RuntimeSettings
from dtam.domain.modes import OperationalMode
from dtam.observability.logging import configure_logging, get_logger
from dtam.scanner_adapters import ScannerAdapter, create_scanner_adapter


@dataclass(frozen=True)
class DtamApp:
    """Minimal bootstrapped application handle for Phase 1."""

    settings: RuntimeSettings
    adapter: ScannerAdapter


def bootstrap(
    *,
    scanner_id: str | None = None,
    environment: str | None = None,
    mode: OperationalMode | None = None,
    config_root: Path | str | None = None,
) -> DtamApp:
    """
    Load configuration, configure logging, and create a scanner adapter.

    Defaults to the simulated scanner in simulation mode.
    """
    settings = load_runtime_settings(
        scanner_id=scanner_id,
        environment=environment,
        mode=mode,
        config_root=config_root,
    )
    configure_logging(settings.app.logging)
    logger = get_logger("dtam.bootstrap")

    adapter = create_scanner_adapter(settings)
    logger.info(
        "dtam_bootstrapped",
        scanner_id=adapter.scanner_id,
        mode=adapter.get_mode().value,
        environment=settings.app.environment,
        field_strength_t=adapter.identity.field_strength_t,
        connected=adapter.is_connected,
    )
    return DtamApp(settings=settings, adapter=adapter)
