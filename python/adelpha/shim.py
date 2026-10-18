"""Passive shim trays. Running a design needs the shim environment and a field map."""

from __future__ import annotations

from adelpha._paths import ensure_impl_path

ensure_impl_path()

from shim.sim import (  # noqa: E402
    DEFAULTS,
    LIMITS,
    export_shim,
    inspect_field_map,
    run_shim,
    shim_request,
    simulate,
)

__all__ = [
    "DEFAULTS",
    "LIMITS",
    "export_shim",
    "inspect_field_map",
    "run_shim",
    "shim_request",
    "simulate",
]
