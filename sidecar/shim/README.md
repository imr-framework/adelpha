# Passive shimming environment

Engineering Studio runs [imr-framework/passive_shimming](https://github.com/imr-framework/passive_shimming/tree/dev_ws_2026) in `shim/.venv`. The console process does not import it. The package requires NumPy 2, `magpylib`, and `pymoo`, which conflict with the console and DTAM environments.

`shim/.venv` is gitignored (`.venv/`). The commit that the desk was built against is pinned in [`requirements.txt`](requirements.txt): `5669ce4` on `dev_ws_2026`.

## Recreate

From the repository root, with [uv](https://docs.astral.sh/uv/) and Python 3.10:

```bash
uv venv shim/.venv --python 3.10
uv pip install --python shim/.venv/bin/python -r shim/requirements.txt
```

The worker looks for `shim/.venv/bin/python`. Override that with `SHIM_PYTHON` if the environment lives somewhere else. Restart Adelpha after creating the environment so the supervisor picks up the `shim` service at `/api/shim`.

This is an Adelpha Engineering Studio service (`shim/sim.py`), not part of the imaging console. Hardware → **Passive shimming** calls `FieldMap`, `TrayGeometry`, `ShimBasis`, and `ShimOptimizer` from that install. The desk loads the same measured `.npy` the upstream solver reads: an N × 4 or N × 8 float array of x, y, z in mm and B in mT, parsed with `FieldMap.from_npy` at 1e-3 scale for both. `POST /api/shim/fieldmap` inspects a map; `POST /api/shim/simulate` shims it. Both routes take the file as base64 in the JSON body, so nothing is stored on disk between calls. After a run, **Save trays** writes the upstream fabrication set through `ShimCollectionExporter` and `ShimTrayExporter`: `shim_tray_top.stl`, `shim_tray_bottom.stl`, the three Magpylib `.pkl` collections, `shim_collection_manifest.json`, `shim_tray_export_report.json`, and `best_solution.json`. On the desktop the native folder dialog chooses the path and the worker writes there. The desk recenters the map's bounding box between the trays by default. A measured map ships at `console/notebooks/passive_shimming/data/Exp_1044_2026831.npy`. Without a file the desk shims a synthetic bore field.

The first run after a restart builds matplotlib's font cache in `$TMPDIR/adelpha-shim-mpl`, which takes several seconds. Later runs reuse it.
