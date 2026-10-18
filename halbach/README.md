# Halbach array designer

Engineering Studio’s Magnet workspace builds Halbach cylinders from [HalbachMRIDesigner](../HalbachMRIDesigner). Cube placement uses the same double-angle magnetization law as `HalbachRing.py`. Catalog rings and slice plates follow `examples/mri1.json`.

The workspace generates the array, an assembly preview (plates, stands, connection rods), and STL/STEP export. It does not run a magnet field study; that action is reserved.

`POST /api/magnet/halbach` returns cube transforms and plate/rod solids. `POST /api/magnet/halbach/export` writes slice or assembly CAD. FEM stays on `/api/magnet/fem`.
