# Third-party components

## HalbachMRIDesigner

- Upstream: https://github.com/menkueclab/HalbachMRIDesigner
- License: **GPL-3.0**
- Local path: `third_party/HalbachMRIDesigner` (git clone) or `DTAM_HALBACH_DESIGNER_PATH`
- DTAM integration: subprocess wrapper in `dtam.tools.magnet` (`run_halbach_designer`, `generate_fem_mesh_files`)

DTAM calls the upstream CLI; it does not import HalbachMRIDesigner modules into
the DTAM domain package. Distribute/comply with GPL-3 for that component as
required by its license.

### Setup

```bash
make vendor-halbach
# or
git clone --depth 1 https://github.com/menkueclab/HalbachMRIDesigner.git third_party/HalbachMRIDesigner
```

Optional Python deps for the designer (see its `requirements.txt`): `gmsh`, `numpy`, `matplotlib`, SolidPython.
