"""Solenoid RF coil windings. Running a design needs the RF coil environment."""

from __future__ import annotations

from adelpha._paths import ensure_impl_path

ensure_impl_path()

from rfcoil.sim import (  # noqa: E402
    DEFAULTS,
    LIMITS,
    rfcoil_request,
    run_rfcoil,
    simulate,
    winding_layout,
)

__all__ = [
    "DEFAULTS",
    "LIMITS",
    "rfcoil_request",
    "run_rfcoil",
    "simulate",
    "winding_layout",
]
