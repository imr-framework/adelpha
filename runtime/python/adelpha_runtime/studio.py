"""Engineering Studio HTTP apps: gradient coils, passive shimming, and magnets.

These are Adelpha features. They are not part of the imaging console. Coil and
shim workers live next to their isolated venvs. Magnet field and Elmer FEM use
the runtime NumPy stack and optional ElmerSolver.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any, Callable

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from adelpha_runtime.paths import RuntimePaths, cors_origins, default_repo_root


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _feature_sim(paths: RuntimePaths, name: str) -> Path:
    """Find ``coil/sim.py``, ``shim/sim.py``, or ``magnet/sim.py``.

    Tauri sets ``ADELPHA_RESOURCE_DIR`` to the app resource folder, which does
    not contain these feature trees. Fall back to the checkout root.
    """
    roots = [paths.resource_dir, default_repo_root(), Path.cwd(), Path.cwd().parent, Path.cwd().parent.parent]
    seen: set[str] = set()
    for root in roots:
        try:
            key = str(root.resolve())
        except OSError:
            key = str(root)
        if key in seen:
            continue
        seen.add(key)
        candidate = root / name / "sim.py"
        if candidate.is_file():
            return candidate
    raise RuntimeError(f"{name} sources are not available in this install")


def _studio_app(service: str, routes: list[tuple[str, Callable[..., Any]]]) -> FastAPI:
    app = FastAPI(title=f"Adelpha {service}", docs_url=None, redoc_url=None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": service}

    for path, handler in routes:

        def make_endpoint(call: Callable[..., Any]):
            def endpoint(body: dict | None = Body(default=None)):
                try:
                    return call(body)
                except ValueError as exc:
                    raise HTTPException(400, str(exc)) from exc
                except Exception as exc:
                    raise HTTPException(503, str(exc)) from exc

            return endpoint

        app.add_api_route(path, make_endpoint(handler), methods=["POST"], name=f"{service}{path.replace('/', '_')}")

    return app


def create_coil_app(paths: RuntimePaths) -> FastAPI:
    sim = _load("adelpha_coil_sim", _feature_sim(paths, "coil"))
    return _studio_app("coil", [("/simulate", sim.run_coil)])


def create_shim_app(paths: RuntimePaths) -> FastAPI:
    sim = _load("adelpha_shim_sim", _feature_sim(paths, "shim"))
    return _studio_app(
        "shim",
        [
            ("/simulate", sim.run_shim),
            ("/fieldmap", sim.inspect_field_map),
            ("/export", sim.export_shim),
        ],
    )


def create_magnet_app(paths: RuntimePaths) -> FastAPI:
    sim = _load("adelpha_magnet_sim", _feature_sim(paths, "magnet"))
    return _studio_app(
        "magnet",
        [
            ("/simulate", sim.run_study),
            ("/validate", sim.run_validate),
        ],
    )
