"""Gradient-coil windings (pyCoilGen). Running a design needs the coil environment."""

from __future__ import annotations

from adelpha._paths import ensure_impl_path

ensure_impl_path()

from coil.sim import (  # noqa: E402
    AXES,
    DEFAULTS,
    LIMITS,
    NAMES,
    SHAPES,
    SUMMARIES,
    coil_request,
    run_coil,
    simulate,
)

__all__ = [
    "AXES",
    "DEFAULTS",
    "LIMITS",
    "NAMES",
    "SHAPES",
    "SUMMARIES",
    "coil_request",
    "run_coil",
    "simulate",
]
