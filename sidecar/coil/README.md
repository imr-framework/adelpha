# Gradient coil environment

Engineering Studio runs [pyCoilGen](https://github.com/sairamgeethanath/pyCoilGen) in `coil/.venv`. This is an Adelpha service (`coil/sim.py` mounted at `/api/coil`), not part of the imaging console. The package stays out of the console process so its NumPy 1 pin does not collide with DTAM.

`coil/.venv` is gitignored (`.venv/`).

## Recreate

```bash
uv venv coil/.venv --python 3.10
uv pip install --python coil/.venv/bin/python -r coil/requirements.txt
```

The worker looks for `coil/.venv/bin/python`. Override that with `COILGEN_PYTHON` if the environment lives somewhere else. Restart Adelpha so the supervisor picks up the `coil` service.

## Biplanar synthesis

`coil/sim.py::_biplanar_profile` adapts the local pyCoilGen examples
`examples/biplanar_xgradient.py` and `examples/biplanar_gradient.py`:

- X uses the transverse example's Tikhonov factor 10, potential offset 0.25,
  and primary level sets. Y uses the same transverse settings with a Y target.
- Z uses the planar example's iterative optimization (five iterations,
  tolerance 1e-9), regularization factor 200, potential offset 0.35, and
  primary level sets.
- Both use target-region resolution 10 and one mesh refinement. A generated
  10 × 10 base grid is refined to retain the previous 20 × 20 surface density.

These are adaptations for Studio's headless contour preview, not executions of
the example scripts. All axes use rectangular XY plates at Z = ±gap/2; the
example X STL has a different orientation, and the Z example uses circular
plates. Studio retains its width, height, gap, contour-count, gradient-strength,
and bounded target-radius controls. Lengths convert from mm to metres and
gradient strength from mT/m to T/m at the worker boundary.

The existing release pipeline produces optimized contours and their field
diagnostics. Studio snapshots the closed topological groups before
interconnection, then fairs those polylines into closed conductor loops
coloured by current polarity. The imaging sphere is centred on the former. After a completed run, Save STL
builds a millimetre tube solid from the displayed loops. Interconnection still runs for
the connected-path field, but it is not the displayed or exported winding.
Planar and circular plates use one mesh refinement, target-region resolution 10,
and `min_loop_significance` 5.

It does not run the planar example's spacing-constrained spiral
extraction, Magpylib evaluation, inductance calculation, or fabrication export.
That planar entry point also requires PyVista and opens interactive previews.
Its radial target-weight assignment is not copied: the installed optimizer
does not consume those weights. The result remains a spatial winding preview,
not a time-domain gradient waveform or a fabrication-ready conductor path.
