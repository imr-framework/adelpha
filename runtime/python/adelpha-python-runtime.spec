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
DTAM_SRC = Path(os.environ.get("ADELPHA_DTAM_SRC", REPO / "dtam" / "src"))
DTAM_ROOT = DTAM_SRC.parent if DTAM_SRC.name == "src" else DTAM_SRC
CONSOLE = Path(os.environ.get("ADELPHA_CONSOLE_ROOT", REPO / "console"))

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
pathex = [str(RUNTIME)]

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
        "torch",
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
