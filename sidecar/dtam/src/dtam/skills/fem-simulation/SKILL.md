---
name: fem-simulation
description: Prepare FEM mesh/solver inputs for Halbach geometries (Gmsh/GetDP via HalbachMRIDesigner --fem).
---

# FEM simulation preparation

## Steps
1. Confirm designer availability with `magnet_designer_status`.
2. Call `generate_fem_mesh_files` with geometry JSON.
3. Report generated `.geo`/`.msh`/`.pickle` artifacts.
4. Do not claim a completed GetDP/sparselizard solve unless that runner is configured.
