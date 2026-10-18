"""STEP upload and isolated FEM workers for the Engineering Studio service."""
from __future__ import annotations

import json
from dataclasses import replace
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import threading
import uuid
import zipfile

from fastapi import Body, HTTPException, Request
from fastapi.responses import FileResponse

MAX_UPLOAD = 100 * 1024 * 1024


def register_fem_routes(app, root: Path, data_dir: Path):
    storage = data_dir / "fem"
    jobs = {}
    lock = threading.Lock()
    # The worker is ordinary Python, even when the HTTP supervisor is frozen.
    python = os.environ.get("ADELPHA_FEM_PYTHON") or (sys.executable if not getattr(sys, "frozen", False) else shutil.which("python3"))
    env = dict(os.environ)
    search = [str(root), env.get("PYTHONPATH", "")]
    for path in (Path("/opt/homebrew/opt/gmsh/lib"), Path("/usr/local/opt/gmsh/lib")):
        if (path / "gmsh.py").is_file():
            search.append(str(path))
    env["PYTHONPATH"] = os.pathsep.join(filter(None, search))
    env["PATH"] = os.pathsep.join([env.get("PATH", ""), "/opt/homebrew/bin", "/usr/local/bin"])

    def worker(*args):
        if not python:
            raise HTTPException(503, "Install Python with Gmsh and set ADELPHA_FEM_PYTHON to its interpreter.")
        return [python, "-m", "simulation.fem", *map(str, args)]

    def folder(kind, identifier):
        if len(identifier) != 32 or any(c not in "0123456789abcdef" for c in identifier):
            raise HTTPException(404, "Unknown FEM upload or job")
        path = storage / kind / identifier
        if not path.is_dir():
            raise HTTPException(404, "Unknown FEM upload or job")
        return path

    def status(identifier):
        path = folder("jobs", identifier)
        with lock:
            state = jobs.get(identifier)
            snapshot = dict(state) if state else None
        status_path = path / "output/status.json"
        value = json.loads(status_path.read_text()) if status_path.is_file() else {"status": "queued"}
        if snapshot and snapshot.get("error"):
            value.update(status="failed", error=snapshot["error"])
        elif not snapshot and value["status"] not in ("completed", "failed"):
            value.update(status="failed", error="The runtime restarted before this job completed. Start a new run.")
        return {**value, "id": identifier, "mesh_available": (path / "output/mesh-preview.json").is_file()}

    @app.post("/fem/uploads")
    async def upload(request: Request, filename: str):
        if Path(filename).suffix.lower() not in (".step", ".stp"):
            raise HTTPException(400, "Choose a .step or .stp file")
        identifier = uuid.uuid4().hex
        path = storage / "uploads" / identifier
        path.mkdir(parents=True)
        try:
            size = 0
            with (path / "geometry.step").open("wb") as stream:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > MAX_UPLOAD:
                        raise HTTPException(413, "STEP files must be smaller than 100 MB")
                    stream.write(chunk)
            if not size:
                raise HTTPException(400, "The STEP file is empty")
            # Offload the subprocess wait; never block the service's event loop.
            import asyncio
            result = await asyncio.to_thread(subprocess.run, worker("inspect", path / "geometry.step"),
                                             cwd=root, env=env, capture_output=True, text=True, timeout=120)
            if result.returncode:
                detail = (result.stderr or "STEP inspection failed")[-4000:]
                try:
                    detail = json.loads(detail).get("error", detail)
                except (ValueError, AttributeError):
                    pass
                raise HTTPException(400, detail)
            inventory = json.loads(result.stdout)
            (path / "inspection.json").write_text(json.dumps(inventory))
            return {"id": identifier, "filename": Path(filename).name, **inventory}
        except HTTPException:
            shutil.rmtree(path)
            raise
        except Exception as exc:
            shutil.rmtree(path)
            raise HTTPException(503, f"Could not inspect STEP: {exc}") from exc

    @app.get("/fem/uploads/{identifier}/file")
    def uploaded_step(identifier: str):
        path = folder("uploads", identifier) / "geometry.step"
        if not path.is_file():
            raise HTTPException(404, "Saved STEP file is missing")
        return FileResponse(path, media_type="application/octet-stream", filename="geometry.step")

    @app.post("/fem/jobs", status_code=202)
    def start(body: dict = Body(...)):
        upload_path = folder("uploads", str(body.get("upload_id", "")))
        # Validate using the same backend schema; never accept client executable or source paths.
        if str(root) not in sys.path:
            sys.path.insert(0, str(root))
        from simulation.fem.config import SimulationConfig
        try:
            settings = dict(body.get("config", {}))
            settings["step_file"] = str(upload_path / "geometry.step")
            solver = settings.get("solver", {})
            if set(solver) - {"tolerance", "max_iterations", "quadratic", "timeout"}:
                raise ValueError("Unsupported solver setting")
            config = SimulationConfig.from_dict(settings)
            inventory = json.loads((upload_path / "inspection.json").read_text())
            assigned = {i for region in config.regions for i in region.solids}
            if assigned != {solid["index"] for solid in inventory["solids"]}:
                raise ValueError("Assign every imported solid exactly once")
        except (ValueError, TypeError, KeyError) as exc:
            raise HTTPException(400, str(exc)) from exc
        identifier = uuid.uuid4().hex
        path = storage / "jobs" / identifier
        # Bound worker concurrency before launching memory-intensive meshing jobs.
        with lock:
            if any(item["process"].poll() is None for item in jobs.values()):
                raise HTTPException(409, "Another FEM simulation is running. Wait for it to finish.")
            path.mkdir(parents=True)
            shutil.copyfile(upload_path / "geometry.step", path / "geometry.step")
            config = replace(config, step_file=str(path / "geometry.step"))
            (path / "config.json").write_text(json.dumps(config.to_dict()))
            try:
                with (path / "worker.log").open("w") as log:
                    process = subprocess.Popen(worker("run", path / "config.json", path / "output"), cwd=root, env=env,
                                               stdout=log, stderr=subprocess.STDOUT, start_new_session=os.name != "nt")
            except Exception as exc:
                raise HTTPException(503, f"Could not start FEM worker: {exc}") from exc
            jobs[identifier] = {"process": process}

        def monitor():
            try:
                code = process.wait(timeout=7200)
                error = None if code == 0 else f"FEM worker exited with code {code}. Download the logs for details."
            except subprocess.TimeoutExpired:
                if os.name != "nt":
                    os.killpg(process.pid, signal.SIGKILL)
                else:
                    process.kill()
                process.wait()
                error = "FEM job exceeded the two-hour limit."
            with lock:
                state = jobs.get(identifier) or {}
                state.pop("process", None)
                if error:
                    existing = path / "output/status.json"
                    if existing.is_file():
                        error = json.loads(existing.read_text()).get("error", error)
                    state["error"] = error
                    jobs[identifier] = state
                else:
                    jobs.pop(identifier, None)
        threading.Thread(target=monitor, daemon=True).start()
        return {"id": identifier, "status": "queued"}

    @app.get("/fem/jobs/{identifier}")
    def get_status(identifier: str):
        return status(identifier)

    @app.get("/fem/jobs/{identifier}/mesh")
    def mesh_preview(identifier: str):
        path = folder("jobs", identifier) / "output/mesh-preview.json"
        if not path.is_file():
            raise HTTPException(409, "The mesh is not ready yet. Run the simulation to generate it.")
        return FileResponse(path, media_type="application/json")

    @app.get("/fem/jobs/{identifier}/fields")
    def field_preview(identifier: str):
        if status(identifier)["status"] != "completed":
            raise HTTPException(409, "Field results are available after the simulation completes.")
        path = folder("jobs", identifier) / "output"
        preview = path / "field-preview.json"
        if preview.is_file():
            return FileResponse(preview, media_type="application/json")
        if str(root) not in sys.path:
            sys.path.insert(0, str(root))
        from adelpha_runtime.memory import release_simulation_memory
        from simulation.fem.fieldpreview import read_field_preview
        try:
            return read_field_preview(path)
        except (ValueError, OSError) as exc:
            raise HTTPException(422, str(exc)) from exc
        finally:
            release_simulation_memory()

    @app.get("/fem/jobs/{identifier}/download")
    def download(identifier: str):
        value = status(identifier)
        if value["status"] not in ("completed", "failed"):
            raise HTTPException(409, "The simulation is still running")
        path = folder("jobs", identifier)
        archive = path / "simulation.zip"
        # Serialize archive creation; simultaneous downloads must not read a partial ZIP.
        with lock:
            if not archive.exists():
                temporary = path / "simulation.zip.tmp"
                with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as bundle:
                    for item in path.rglob("*"):
                        if item.is_file() and item not in (archive, temporary):
                            bundle.write(item, item.relative_to(path))
                temporary.replace(archive)
        return FileResponse(archive, media_type="application/zip", filename=f"elmer-{identifier[:8]}.zip")
