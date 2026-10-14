"""STEP-based Elmer magnetostatics. All geometry and mesh inputs use SI metres."""
from .config import Material, MeshOptions, RefinementBox, Region, SimulationConfig, SolverOptions
from .meshgen import generate_mesh, inspect_step
from .sifgen import generate_sif
from .solver import prepare, run

__all__ = ["Material", "MeshOptions", "RefinementBox", "Region", "SimulationConfig", "SolverOptions",
           "inspect_step", "generate_mesh", "generate_sif", "prepare", "run"]
