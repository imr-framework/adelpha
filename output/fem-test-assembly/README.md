# FEM test assembly

Import `assembly.step` into an Adelpha FEM project. It contains two closed solid
10 mm cubes with a 10 mm gap along Z.

1. Choose **Use STEP file** and select `assembly.step`.
2. Assign both solids the permanent magnet material preset (relative permeability
   1.05, remanence X = 0, Y = 0, Z = 1.2 T).
3. Use a 2 mm solid element size, 12 mm air element size, 60 mm air padding,
   and 20 mm mesh transition distance.
4. Click **Run simulation**. Once meshing finishes, choose **Mesh view**.
5. Rotate/zoom the mesh and try **Wireframe** and **Show air domain**.

`config.json` is a CLI example with additional gap refinement. The completed
CLI run is in `verified-run/`: 3,018 nodes and 14,651 tetrahedra, with magnetic
field results in `verified-run/results/fields_t0001.vtu`.

This is a small functional test model, not a calibrated magnet design.
