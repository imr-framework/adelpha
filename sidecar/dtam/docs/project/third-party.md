---
icon: lucide/box
---

# Third-party components

## HalbachMRIDesigner

- Upstream: [menkueclab/HalbachMRIDesigner](https://github.com/menkueclab/HalbachMRIDesigner)
- License: **GPL-3.0**
- Local path: `third_party/HalbachMRIDesigner` (via `make vendor-halbach`) or `DTAM_HALBACH_DESIGNER_PATH`
- DTAM integration: subprocess wrapper in `dtam.tools.magnet`

DTAM calls the upstream CLI; it does not import HalbachMRIDesigner into the domain package.

```bash
make vendor-halbach
```
