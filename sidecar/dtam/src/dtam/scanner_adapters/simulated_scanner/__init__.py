"""Virtual scanner package."""

from dtam.scanner_adapters.simulated_scanner.adapter import (
    SimulatedScannerAdapter,
    create_simulated_scanner,
)

__all__ = ["SimulatedScannerAdapter", "create_simulated_scanner"]
