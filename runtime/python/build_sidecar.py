#!/usr/bin/env python3
"""Build the platform-specific adelpha-python-runtime onedir bundle.

Never pip-install into Homebrew / PEP 668 interpreters. Freeze with a project
venv (prefer ``dtam/.venv``, then ``runtime/python/.venv``).
"""

from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SPEC = Path(__file__).resolve().parent / "adelpha-python-runtime.spec"
DIST = REPO / "packaging" / "sidecar" / "dist"
TAURI_RESOURCES = REPO / "src-tauri" / "resources" / "python-runtime"
RUNTIME_VENV = REPO / "runtime" / "python" / ".venv"
DTAM_VENV = REPO / "dtam" / ".venv"


def target_triple() -> str:
    system = platform.system().lower()
    machine = platform.machine().lower()
    if system == "darwin":
        arch = "aarch64" if machine in {"arm64", "aarch64"} else "x86_64"
        return f"{arch}-apple-darwin"
    if system == "windows":
        arch = "aarch64" if machine in {"arm64", "aarch64"} else "x86_64"
        return f"{arch}-pc-windows-msvc"
    arch = "aarch64" if machine in {"arm64", "aarch64"} else "x86_64"
    return f"{arch}-unknown-linux-gnu"


def _venv_python(venv: Path) -> Path:
    if os.name == "nt":
        return venv / "Scripts" / "python.exe"
    return venv / "bin" / "python"


def _has_pip(python: Path) -> bool:
    return subprocess.run(
        [str(python), "-m", "pip", "--version"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode == 0


def _is_externally_managed(python: Path) -> bool:
    probe = subprocess.run(
        [
            str(python),
            "-c",
            "import sys; from pathlib import Path; "
            "print(int((Path(sys.prefix) / 'EXTERNALLY-MANAGED').is_file()))",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    return probe.returncode == 0 and probe.stdout.strip() == "1"


def resolve_freeze_python() -> Path:
    explicit = os.environ.get("ADELPHA_SIDECAR_PYTHON") or os.environ.get("ADELPHA_DEV_PYTHON")
    if explicit:
        path = Path(explicit)
        if not path.is_file():
            raise FileNotFoundError(f"ADELPHA_SIDECAR_PYTHON is not a Python binary: {path}")
        return path

    for venv in (DTAM_VENV, RUNTIME_VENV):
        python = _venv_python(venv)
        if python.is_file():
            return python

    if _has_pip(Path(sys.executable)) and not _is_externally_managed(Path(sys.executable)):
        return Path(sys.executable)

    print(f"creating sidecar build venv at {RUNTIME_VENV}", flush=True)
    RUNTIME_VENV.parent.mkdir(parents=True, exist_ok=True)
    subprocess.check_call([sys.executable, "-m", "venv", str(RUNTIME_VENV)])
    python = _venv_python(RUNTIME_VENV)
    if not python.is_file():
        raise RuntimeError(f"failed to create {python}")
    return python


def pip_install(python: Path, args: list[str]) -> None:
    if _has_pip(python):
        subprocess.check_call([str(python), "-m", "pip", "install", *args])
        return
    uv = shutil.which("uv")
    if uv:
        subprocess.check_call([uv, "pip", "install", "--python", str(python), *args])
        return
    raise RuntimeError(
        f"{python} has no pip module. Install uv (https://docs.astral.sh/uv/) "
        "or run `make install` so runtime/python/.venv exists."
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-install", action="store_true")
    args = parser.parse_args()

    dtam_src = Path(os.environ.get("ADELPHA_DTAM_SRC", REPO / "dtam" / "src"))
    if not dtam_src.is_dir():
        print(
            "error: DTAM sources not found at "
            f"{dtam_src}. Clone https://github.com/imr-framework/dtam into dtam/",
            file=sys.stderr,
        )
        return 2

    python = resolve_freeze_python()
    print(f"sidecar freeze interpreter: {python}", flush=True)

    if not args.skip_install:
        runtime_root = Path(__file__).parent
        pip_install(python, ["-e", f"{runtime_root}[build]"])
        dtam_root = dtam_src.parent if dtam_src.name == "src" else dtam_src
        if (dtam_root / "pyproject.toml").is_file():
            try:
                pip_install(python, [str(dtam_root)])
            except subprocess.CalledProcessError:
                print(
                    f"warning: could not install DTAM into {python}; "
                    "the freeze will still collect dtam/src if it is on disk.",
                    file=sys.stderr,
                )

    DIST.mkdir(parents=True, exist_ok=True)
    subprocess.check_call(
        [
            str(python),
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--distpath",
            str(DIST),
            "--workpath",
            str(REPO / "packaging" / "sidecar" / "build"),
            str(SPEC),
        ],
        cwd=str(REPO),
    )

    bundle = DIST / "adelpha-python-runtime"
    if not bundle.is_dir():
        print(f"error: expected onedir at {bundle}", file=sys.stderr)
        return 1

    if TAURI_RESOURCES.exists():
        shutil.rmtree(TAURI_RESOURCES)
    shutil.copytree(bundle, TAURI_RESOURCES)
    print(f"sidecar onedir → {TAURI_RESOURCES}")
    print(f"target triple (for naming/docs): {target_triple()}")
    print("Tauri copies this onedir to $RESOURCE/python-runtime/adelpha-python-runtime")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
