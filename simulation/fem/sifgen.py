"""Generate Elmer's 3D edge-element magnetostatic A formulation."""
from pathlib import Path

from .config import MU0, SimulationConfig


def generate_sif(config: SimulationConfig, manifest: dict, directory):
    """Write case.sif using physical IDs preserved by ElmerGrid (-autoclean is not used)."""
    options = config.solver
    body_names = {b["name"] for b in manifest["bodies"]}
    if body_names != {"air", *(r.name for r in config.regions)}:
        raise ValueError("Mesh manifest does not match the configured regions")
    text = f'''Header
  CHECK KEYWORDS Warn
  Mesh DB "." "mesh"
End
Simulation
  Coordinate System = Cartesian 3D
  Simulation Type = Steady State
  Steady State Max Iterations = 1
  Output Intervals = 1
  Max Output Level = 5
End
Constants
  Permeability of Vacuum = {MU0:.16g}
End
Equation 1
  Active Solvers(3) = 1 2 3
End
Solver 1
  Equation = "Magnetostatics"
  Procedure = "MagnetoDynamics" "WhitneyAVSolver"
  Variable = "AV"
  Edge Basis = Logical True
  Use Piola Transform = Logical True
  Quadratic Approximation = Logical {str(options.quadratic)}
  Linear System Solver = Iterative
  Linear System Iterative Method = BiCGStabL
  BiCGStabL Polynomial Degree = 2
  Linear System Preconditioning = None
  Linear System Max Iterations = {options.max_iterations}
  Linear System Convergence Tolerance = {options.tolerance:.16g}
  Linear System Abort Not Converged = Logical True
  Linear System Residual Output = 50
  Steady State Convergence Tolerance = {options.tolerance:.16g}
End
Solver 2
  Equation = "Magnetic fields"
  Procedure = "MagnetoDynamics" "MagnetoDynamicsCalcFields"
  Potential Variable = "AV"
  Calculate Magnetic Flux Density = Logical True
  Calculate Magnetic Field Strength = Logical True
  Calculate Magnetic Vector Potential = Logical True
  Linear System Solver = Iterative
  Linear System Iterative Method = CG
  Linear System Preconditioning = ILU0
  Linear System Symmetric = Logical True
  Linear System Max Iterations = {options.max_iterations}
  Linear System Convergence Tolerance = {options.tolerance:.16g}
  Linear System Abort Not Converged = Logical True
End
Solver 3
  Exec Solver = After Simulation
  Equation = "VTU output"
  Procedure = "ResultOutputSolve" "ResultOutputSolver"
  Output File Name = "fields"
  Output Directory = "results"
  Vtu Format = Logical True
  Binary Output = Logical False
  Save Geometry IDs = Logical True
  Discontinuous Bodies = Logical True
End
Boundary Condition 1
  Target Boundaries(1) = {manifest['far_field_id']}
  AV {{e}} = Real 0
End
'''
    regions = {r.name: r for r in config.regions}
    force_id = 0
    for body in manifest["bodies"]:
        i = body["id"]
        material = None if body["name"] == "air" else config.materials[regions[body["name"]].material]
        mu_r = material.relative_permeability if material else 1.0
        text += f'''\nBody {i}
  Target Bodies(1) = {i}
  Equation = 1
  Material = {i}
'''
        if material and any(material.remanence):
            force_id += 1
            text += f"  Body Force = {force_id}\n"
        text += f'''End
Material {i}
  Relative Permeability = Real {mu_r:.16g}
  Relative Permittivity = Real 1
End
'''
        if material and any(material.remanence):
            text += f"Body Force {force_id}\n"
            # Elmer's source uses B = mu * (H + M), so Br = mu0*mu_r*M.
            for axis, br in enumerate(material.remanence, 1):
                text += f"  Magnetization {axis} = Real {br / (MU0 * mu_r):.16g}\n"
            text += "End\n"
    path = Path(directory) / "case.sif"
    path.write_text(text)
    return path
