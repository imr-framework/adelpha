# Magnet field and Elmer FEM

Engineering Studio runs assembly-based magnet and FEM studies from `magnet/sim.py` at `/api/magnet`. The service is not part of the imaging console. Gradient coils (`/api/coil`) and passive shimming (`/api/shim`) stay separate and do not read this assembly model.

The supervisor loads `magnet/sim.py` in the runtime process. Analytical magnetostatics use NumPy, which is already in the sidecar. Elmer is optional: if `ElmerSolver` is not on `PATH`, the FEM route prepares a traceable case and returns an explicit limitation instead of a completed field.

## What is calculated

| Study | Model | Needs |
| --- | --- | --- |
| Magnet field | Uniformly magnetized cuboid or dipole superposition | Included permanent magnets with remanence and direction. Yokes are reported, not solved. |
| Elmer FEM | Magnetostatic Whitney AV case | Included magnets and yokes on a structured volume mesh. A completed field requires `ElmerSolver` and an ASCII `case.vtu`. |

Both studies use only parts **added to simulation**. Viewport visibility and selection are ignored.

## Recreate

No extra virtualenv is required. Restart Adelpha after pulling this tree so the supervisor mounts `/api/magnet`.

```bash
# optional, for volumetric FEM
which ElmerSolver
```

## Tests

```bash
runtime/python/.venv/bin/pytest magnet/test_magnet_sim.py runtime/python/tests/test_studio.py -q
```
