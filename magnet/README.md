# Magnet service

Engineering Studio mounts Halbach array design and Elmer FEM at `/api/magnet`. The service is not part of the imaging console. Gradient coils (`/api/coil`) and passive shimming (`/api/shim`) stay separate.

The Magnet workspace is the parameterized Halbach cylinder designer (`halbach/sim.py`, from HalbachMRIDesigner). It places cube magnets. It does not run an assembly field study.

FEM still uses `/api/magnet/fem` with an imported STEP file.

## Recreate

Restart Adelpha after pulling this tree so the supervisor mounts `/api/magnet`.

```bash
# optional, for volumetric FEM
which ElmerSolver
```

## Tests

```bash
runtime/python/.venv/bin/pytest halbach/test_halbach_sim.py runtime/python/tests/test_studio.py -q
```
