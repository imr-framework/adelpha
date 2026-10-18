"""Validated, JSON-serializable inputs for SI-unit magnetostatic simulations."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
import json
import math
from pathlib import Path
import re

MU0 = 4e-7 * math.pi


def positive(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        raise ValueError(f"{name} must be finite and positive")


def vector(value, name):
    if len(value) != 3 or any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) for x in value):
        raise ValueError(f"{name} must contain three finite numbers")


@dataclass(frozen=True)
class Material:
    relative_permeability: float = 1.0
    # Remanent flux density in tesla, in the global STEP coordinate system.
    remanence: tuple[float, float, float] = (0.0, 0.0, 0.0)

    def __post_init__(self):
        positive(self.relative_permeability, "relative_permeability")
        vector(self.remanence, "remanence")


@dataclass(frozen=True)
class Region:
    name: str
    solids: tuple[int, ...]
    material: str
    mesh_size: float | None = None

    def __post_init__(self):
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*", self.name) or self.name == "air":
            raise ValueError("Region names must be identifiers and cannot be 'air'")
        if not self.solids or any(type(x) is not int or x < 1 for x in self.solids) or len(set(self.solids)) != len(self.solids):
            raise ValueError("solids must be unique positive inspection indices")
        if self.mesh_size is not None:
            positive(self.mesh_size, "region mesh_size")


@dataclass(frozen=True)
class RefinementBox:
    minimum: tuple[float, float, float]
    maximum: tuple[float, float, float]
    size: float

    def __post_init__(self):
        vector(self.minimum, "minimum")
        vector(self.maximum, "maximum")
        if any(a >= b for a, b in zip(self.minimum, self.maximum)):
            raise ValueError("Refinement box minimum must be below maximum")
        positive(self.size, "refinement size")


@dataclass(frozen=True)
class MeshOptions:
    size: float = 0.005
    air_size: float = 0.02
    air_padding: float = 0.1
    # Distance over which part-surface refinement transitions to air_size.
    transition: float = 0.02
    minimum_quality: float = 0.01
    threads: int = 1
    refinement_boxes: tuple[RefinementBox, ...] = ()

    def __post_init__(self):
        for key in ("size", "air_size", "air_padding", "transition"):
            positive(getattr(self, key), key)
        if not math.isfinite(self.minimum_quality) or not 0 <= self.minimum_quality < 1:
            raise ValueError("minimum_quality must be in [0, 1)")
        if type(self.threads) is not int or self.threads < 1:
            raise ValueError("threads must be a positive integer")
        if self.air_size < self.size:
            raise ValueError("air_size must be at least size")


@dataclass(frozen=True)
class SolverOptions:
    tolerance: float = 1e-9
    max_iterations: int = 5000
    quadratic: bool = False
    timeout: float = 1800.0
    elmer_grid: str = "ElmerGrid"
    elmer_solver: str = "ElmerSolver"

    def __post_init__(self):
        positive(self.tolerance, "tolerance")
        positive(self.timeout, "timeout")
        if self.tolerance >= 1:
            raise ValueError("tolerance must be less than one")
        if type(self.max_iterations) is not int or self.max_iterations < 1:
            raise ValueError("max_iterations must be a positive integer")
        if type(self.quadratic) is not bool:
            raise ValueError("quadratic must be boolean")
        if not self.elmer_grid or not self.elmer_solver:
            raise ValueError("Elmer executable names cannot be empty")


@dataclass(frozen=True)
class SimulationConfig:
    step_file: str
    materials: dict[str, Material]
    regions: tuple[Region, ...]
    mesh: MeshOptions = field(default_factory=MeshOptions)
    solver: SolverOptions = field(default_factory=SolverOptions)

    def __post_init__(self):
        if not self.step_file or not self.regions:
            raise ValueError("A STEP file and explicit region assignments are required")
        names, assigned = set(), set()
        for region in self.regions:
            if region.name in names or assigned.intersection(region.solids):
                raise ValueError("Duplicate region name or multiply assigned solid")
            if region.material not in self.materials:
                raise ValueError(f"Unknown material: {region.material}")
            names.add(region.name)
            assigned.update(region.solids)

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, data):
        data = dict(data)
        data["materials"] = {k: Material(**v) for k, v in data["materials"].items()}
        data["regions"] = tuple(Region(**v) for v in data["regions"])
        mesh = dict(data.get("mesh", {}))
        mesh["refinement_boxes"] = tuple(RefinementBox(**v) for v in mesh.get("refinement_boxes", []))
        data["mesh"] = MeshOptions(**mesh)
        data["solver"] = SolverOptions(**data.get("solver", {}))
        return cls(**data)

    @classmethod
    def load(cls, path):
        path = Path(path).resolve()
        data = json.loads(path.read_text())
        data["step_file"] = str((path.parent / data["step_file"]).resolve())
        return cls.from_dict(data)
