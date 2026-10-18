"""Halbach cylinder geometry used by Engineering Studio Magnet."""

from __future__ import annotations

from adelpha._paths import ensure_impl_path

ensure_impl_path()

from halbach.sim import (  # noqa: E402
    DEFAULTS,
    LIMITS,
    MECH_LIMITS,
    design,
    export_cad,
    expand_slices,
    halbach_request,
    parse_geometry,
    uniform_geometry,
)

__all__ = [
    "DEFAULTS",
    "LIMITS",
    "MECH_LIMITS",
    "design",
    "export_cad",
    "expand_slices",
    "halbach_request",
    "parse_geometry",
    "uniform_geometry",
]
