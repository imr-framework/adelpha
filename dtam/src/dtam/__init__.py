"""DTAM — Digital Twin Architecture for MRI."""

from __future__ import annotations

from dtam.bootstrap import DtamApp, bootstrap


def main() -> None:
    """Load the default simulated scanner and print a short status line."""
    app = bootstrap(environment="development", scanner_id="simulated_scanner")
    adapter = app.adapter
    batch = adapter.read_measurements()
    print(
        "DTAM ready "
        f"scanner={adapter.scanner_id} "
        f"mode={adapter.get_mode().value} "
        f"sensors={len(adapter.list_sensors())} "
        f"measurements={len(batch.measurements)} "
        f"correlation_id={batch.correlation_id}"
    )


__all__ = ["DtamApp", "bootstrap", "main"]
