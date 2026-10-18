"""Halbach-cylinder geometry from HalbachMRIDesigner."""

from .sim import (
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
