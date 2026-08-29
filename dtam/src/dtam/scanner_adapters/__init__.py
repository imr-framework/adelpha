"""Scanner adapter factory and exports."""

from __future__ import annotations

from dtam.config.loader import load_runtime_settings
from dtam.config.models import RuntimeSettings, ScannerProfile
from dtam.core.exceptions import ConfigurationError
from dtam.domain.modes import OperationalMode
from dtam.scanner_adapters.base import ScannerAdapter
from dtam.scanner_adapters.halbach_48mt import Halbach48mTAdapter
from dtam.scanner_adapters.simulated_scanner import (
    SimulatedScannerAdapter,
    create_simulated_scanner,
)


def create_scanner_adapter(
    settings: RuntimeSettings | None = None,
    *,
    scanner_id: str | None = None,
    mode: OperationalMode | None = None,
) -> ScannerAdapter:
    """Instantiate the appropriate adapter for the configured scanner profile."""
    runtime = settings or load_runtime_settings(scanner_id=scanner_id, mode=mode)
    profile = runtime.scanner
    effective_mode = mode or runtime.mode

    if profile.id == "simulated_scanner" or profile.architecture.startswith("virtual"):
        return create_simulated_scanner(profile, mode=effective_mode)

    if profile.id == "halbach_48mt":
        return Halbach48mTAdapter(profile)

    raise ConfigurationError(
        f"No adapter implementation registered for scanner '{profile.id}'.",
        scanner_id=profile.id,
        recommended_response=(
            "Use scanner_id='simulated_scanner' for Phase 1, or register a new adapter."
        ),
    )


__all__ = [
    "Halbach48mTAdapter",
    "ScannerAdapter",
    "ScannerProfile",
    "SimulatedScannerAdapter",
    "create_scanner_adapter",
    "create_simulated_scanner",
]
