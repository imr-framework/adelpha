"""STEP-based Elmer magnetostatics. Geometry and mesh inputs use SI metres."""

from __future__ import annotations

from adelpha._paths import ensure_impl_path

ensure_impl_path()

from simulation.fem import (  # noqa: E402
    Material,
    MeshOptions,
    RefinementBox,
    Region,
    SimulationConfig,
    SolverOptions,
    generate_mesh,
    generate_sif,
    inspect_step,
    prepare,
    run,
)

__all__ = [
    "Material",
    "MeshOptions",
    "RefinementBox",
    "Region",
    "SimulationConfig",
    "SolverOptions",
    "generate_mesh",
    "generate_sif",
    "inspect_step",
    "prepare",
    "run",
]
