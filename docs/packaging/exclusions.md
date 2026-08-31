# Excluded from the desktop sidecar and installer

Do not package the repository wholesale. The following stay out of
`adelpha-python-runtime` and the Tauri bundle.

## Always excluded

| Path / class | Reason |
| --- | --- |
| `node_modules/` | Rebuilt into the Vite `dist/` only |
| `release/` | Legacy Electron output |
| `dist/` | Frontend build input, not a Python resource |
| `__pycache__/`, `*.pyc` | Generated |
| `.venv/`, `dtam/.venv/` | Developer environments |
| `.env`, `.env.local`, `dtam/.env` | Secrets. Never bundle. |
| `site/`, `.zensical/` | Docs build output |
| Test fixtures not required at runtime | `dtam/tests`, `console` test trees |
| Development scripts | FPGA programming, Red Pitaya setup |
| Machine-specific config | Local ports, absolute lab paths |

## Hardware / scanner-only (not desktop)

| Path | Classification |
| --- | --- |
| `console/external/marcos_extras/*.bit*` | FPGA / Red Pitaya deployment |
| `console/external/marcos_extras/*.dtbo` | Device tree overlays |
| `console/external/marcos_extras` setup scripts | Privileged hardware deploy |
| `console/external/marcos_server/` | Scanner/server C++ runtime |
| `console/services/acq/main.py` hard-coded `/opt/mri4all/console/external/` | Scanner-side acquisition |
| Kernel / device-tree operations | Hardware deploy workflow |

Desktop MaRCoS behavior: the imaging-console API may report
**hardware unavailable** / simulation mode. Users configure a remote scanner
explicitly; Adelpha never auto-runs FPGA programming.

## Heavy / optional Python

| Item | Action |
| --- | --- |
| PyQt5 / `console/run_ui.py` | Not bundled |
| `torch`, ONNX, PINN extra | Not in the default sidecar |
| HalbachMRIDesigner vendor tree | Not bundled (`make vendor-halbach` remains a lab workflow) |
| `console/requirements.txt` numpy 1.25 + numba | Not installed in the sidecar interpreter |

## Included (desktop client runtime)

- `runtime/python/adelpha_runtime/`
- DTAM Python package (`dtam/src`) and `dtam/configs/` when present
- Console HTTP façade (`console/services/api`, `console/common`, sequence
  Python with FALLBACK catalog)
- FLOCRA interpreter Python (`console/external/flocra_pulseq`), MIT
- Static GUI assets from Vite `dist/` and `public/`
