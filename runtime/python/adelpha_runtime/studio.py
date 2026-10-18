"""Engineering Studio HTTP apps: gradient coils, RF coils, passive shimming, and magnets.

These are Adelpha features. They are not part of the imaging console. Coil, RF,
and shim workers live next to their isolated venvs. The magnet service hosts the
Halbach array designer and Elmer FEM.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any, Callable

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from adelpha_runtime.memory import release_simulation_memory
from adelpha_runtime.paths import RuntimePaths, cors_origins, default_repo_root, sidecar_root


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _feature_sim(paths: RuntimePaths, name: str) -> Path:
    """Find ``coil/sim.py``, ``rfcoil/sim.py``, ``shim/sim.py``, ``halbach/sim.py``, or ``magnet/sim.py``.

    Tauri sets ``ADELPHA_RESOURCE_DIR`` to the app resource folder, which does
    not contain these feature trees. Fall back to the checkout root.
    """
    roots = [
        paths.resource_dir,
        Path(getattr(sys, "_MEIPASS", paths.resource_dir)),
        sidecar_root(),
        default_repo_root(),
        Path.cwd(),
        Path.cwd().parent,
        Path.cwd().parent.parent,
    ]
    seen: set[str] = set()
    for root in roots:
        try:
            resolved = root.resolve()
        except OSError:
            resolved = root
        bases = (resolved, resolved / "sidecar")
        for base in bases:
            key = str(base)
            if key in seen:
                continue
            seen.add(key)
            candidate = base / name / "sim.py"
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

    @app.middleware("http")
    async def release_after_simulation(request, call_next):
        try:
            return await call_next(request)
        finally:
            if request.method == "POST":
                release_simulation_memory()

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


def create_dev_magnet_app() -> FastAPI:
    """Standalone service used by Vite's /api/magnet proxy."""
    from adelpha_runtime.paths import resolve_paths
    return create_magnet_app(resolve_paths())


def create_coil_app(paths: RuntimePaths) -> FastAPI:
    sim = _load("adelpha_coil_sim", _feature_sim(paths, "coil"))
    return _studio_app("coil", [("/simulate", sim.run_coil)])


def create_rf_app(paths: RuntimePaths) -> FastAPI:
    sim = _load("adelpha_rfcoil_sim", _feature_sim(paths, "rfcoil"))
    return _studio_app("rf", [("/simulate", sim.run_rfcoil)])


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
    halbach = _load("adelpha_halbach_sim", _feature_sim(paths, "halbach"))
    app = _studio_app("magnet", [("/halbach", halbach.design), ("/halbach/export", halbach.export_cad)])

    from adelpha_runtime.fem import register_fem_routes
    register_fem_routes(app, _feature_sim(paths, "magnet").parent.parent, paths.data_dir)
    return app
