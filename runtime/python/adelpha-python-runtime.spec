# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller onedir spec for adelpha-python-runtime.

Build from the repository root:

    python runtime/python/build_sidecar.py
"""

from __future__ import annotations

import os
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

SPECDIR = Path(SPECPATH).resolve()
REPO = SPECDIR.parents[1]
RUNTIME = REPO / "runtime" / "python"
SIDECAR = REPO / "sidecar"
DTAM_SRC = Path(os.environ.get("ADELPHA_DTAM_SRC", SIDECAR / "dtam" / "src"))
DTAM_ROOT = DTAM_SRC.parent if DTAM_SRC.name == "src" else DTAM_SRC
CONSOLE = Path(os.environ.get("ADELPHA_CONSOLE_ROOT", SIDECAR / "console"))

hiddenimports = [
    "adelpha_runtime",
    "adelpha_runtime.__main__",
    "adelpha_runtime.gateway",
    "adelpha_runtime.registry",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "multiprocessing",
    "pydicom",
    "google.adk",
    "google.adk.cli",
]
hiddenimports += collect_submodules("adelpha_runtime")
try:
    hiddenimports += collect_submodules("google.adk")
except Exception:
    pass

datas = []
# Keep FEM source available to the isolated external Python/Gmsh worker.
datas.append((str(SIDECAR / "simulation" / "fem"), "simulation/fem"))
fem_init = SIDECAR / "simulation" / "__init__.py"
if fem_init.is_file():
    datas.append((str(fem_init), "simulation"))
for name in ("coil", "rfcoil", "shim", "halbach", "magnet"):
    folder = SIDECAR / name
    for filename in ("sim.py", "__init__.py", "pycoilgen_compat.py"):
        src = folder / filename
        if src.is_file():
            datas.append((str(src), name))
pathex = [str(RUNTIME), str(SIDECAR)]

if DTAM_SRC.is_dir():
    pathex.append(str(DTAM_SRC))
    hiddenimports += collect_submodules("dtam")
    datas += collect_data_files("dtam")
    configs = DTAM_ROOT / "configs"
    if configs.is_dir():
        datas.append((str(configs), "dtam-configs"))

if CONSOLE.is_dir():
    pathex.append(str(CONSOLE))
    pathex.append(str(CONSOLE / "external"))
    hiddenimports += [
        "services.api",
        "services.api.app",
        "services.api.events",
        "services.api.sequences_api",
        "common.config",
        "common.runtime",
        "common.queue",
        "common.types",
        "common.constants",
    ]
    # Python sources only — bitstreams, dtbo, C++ servers stay out.
    for rel in ("services", "common", "sequences", "external/flocra_pulseq"):
        src = CONSOLE / rel
        if src.exists():
            datas.append((str(src), rel.replace("\\", "/")))

# Pip pypulseq must win over sidecar/console/pypulseq (MRI4ALL 7-column RF).
try:
    import pypulseq as _pip_pypulseq

    _pypulseq_root = Path(_pip_pypulseq.__file__).resolve().parent.parent
    if _pypulseq_root.is_dir():
        pathex.insert(0, str(_pypulseq_root))
except Exception:
    pass

def _runtime_submodules(pkg: str) -> list[str]:
    return [
        mod
        for mod in collect_submodules(pkg)
        if ".tests" not in mod
        and ".testing" not in mod
        and ".benchmarks" not in mod
        and not mod.endswith(".conftest")
    ]

# Engineering Studio workers run as `run-script` children of this binary.
for pkg in (
    "pyCoilGen",
    "pulp",
    "magpylib",
    "pymoo",
    "MRzeroCore",
    "pypulseq",
    "trimesh",
    "sympy",
):
    try:
        hiddenimports += _runtime_submodules(pkg)
        datas += collect_data_files(pkg)
    except Exception:
        pass
for name in (
    "torch",
    "adelpha_runtime.workers",
    "services.api.mrzero_sim",
    "shimming_io",
    "shimming_geometry",
    "shimming_basis",
    "shimming_optimization",
    "shimming_export",
    "shimming_reporting",
    "make_shim_rings",
):
    hiddenimports.append(name)

block_cipher = None

a = Analysis(
    [str(RUNTIME / "adelpha_runtime" / "__main__.py")],
    pathex=pathex,
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "PyQt5",
        "PyQt6",
        "PySide2",
        "PySide6",
        "onnx",
        "onnxruntime",
        "IPython",
        "matplotlib.tests",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="adelpha-python-runtime",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name="adelpha-python-runtime",
)
