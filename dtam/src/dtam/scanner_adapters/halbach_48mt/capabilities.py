"""48 mT Halbach capability helpers (no hardware I/O in Phase 1)."""

from __future__ import annotations

from dtam.config.loader import load_scanner_profile
from dtam.config.models import ScannerProfile
from dtam.config.paths import resolve_config_root
from dtam.domain.entities.scanner import ScannerCapabilities


def load_halbach_48mt_profile(config_root: str | None = None) -> ScannerProfile:
    root = resolve_config_root(config_root)
    return load_scanner_profile(root, "halbach_48mt")


def halbach_48mt_capabilities(config_root: str | None = None) -> ScannerCapabilities:
    return load_halbach_48mt_profile(config_root).capabilities
