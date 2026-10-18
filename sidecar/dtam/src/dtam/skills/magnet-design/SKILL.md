---
name: magnet-design
description: Design or regenerate Halbach magnet geometries using HalbachMRIDesigner.
---

# Magnet design

Upstream tool: https://github.com/menkueclab/HalbachMRIDesigner (GPL-3.0)

## Steps
1. Call `magnet_designer_status` and stop with setup instructions if missing.
2. Provide geometry JSON (inline or path to an examples/*.json file).
3. Call `run_halbach_designer` with `scad=true` for OpenSCAD output.
4. Summarize artifacts written under `artifacts/halbach/`.
