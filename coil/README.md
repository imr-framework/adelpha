# Gradient coil environment

Engineering Studio runs [pyCoilGen](https://github.com/sairamgeethanath/pyCoilGen) in `coil/.venv`. This is an Adelpha service (`coil/sim.py` mounted at `/api/coil`), not part of the imaging console. The package stays out of the console process so its NumPy 1 pin does not collide with DTAM.

`coil/.venv` is gitignored (`.venv/`).

## Recreate

```bash
uv venv coil/.venv --python 3.10
uv pip install --python coil/.venv/bin/python -r coil/requirements.txt
```

The worker looks for `coil/.venv/bin/python`. Override that with `COILGEN_PYTHON` if the environment lives somewhere else. Restart Adelpha so the supervisor picks up the `coil` service.
