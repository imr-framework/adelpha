"""Prepare and execute isolated Elmer jobs with durable status and diagnostic logs."""
from __future__ import annotations

from dataclasses import replace
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import xml.etree.ElementTree as ET

from .config import SimulationConfig
from .meshgen import generate_mesh
from .sifgen import generate_sif


def _save(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def _execute(command, directory, log_name, timeout):
    executable = shutil.which(command[0])
    if executable is None:
        raise RuntimeError(f"Executable not found: {command[0]}. Install Elmer or configure its executable path.")
    log = directory / log_name
    with log.open("w") as stream:
        try:
            result = subprocess.run([executable, *command[1:]], cwd=directory, stdout=stream,
                                    stderr=subprocess.STDOUT, timeout=timeout, check=False,
                                    env={**os.environ, "OMP_NUM_THREADS": "1"})
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"{command[0]} exceeded {timeout}s; see {log}") from exc
    output = log.read_text(errors="replace")
    if result.returncode or re.search(r"(?im)^\s*(?:ERROR|FATAL)\b|failed to converge|not converged|did not converge", output):
        raise RuntimeError(f"{command[0]} failed (exit {result.returncode}); see {log}")
    return output


def _validate_mesh(directory, manifest):
    mesh = directory / "mesh"
    for name in ("mesh.header", "mesh.nodes", "mesh.elements", "mesh.boundary"):
        if not (mesh / name).is_file() or not (mesh / name).stat().st_size:
            raise RuntimeError(f"ElmerGrid did not produce {name}")
    body_ids = {int(line.split()[1]) for line in (mesh / "mesh.elements").read_text().splitlines() if line.strip()}
    if body_ids != {body["id"] for body in manifest["bodies"]}:
        raise RuntimeError("ElmerGrid changed physical body IDs; refusing incorrect material assignment")
    boundary_ids = {int(line.split()[1]) for line in (mesh / "mesh.boundary").read_text().splitlines() if line.strip()}
    if manifest["far_field_id"] not in boundary_ids:
        raise RuntimeError("Far-field boundary missing from converted mesh")


def prepare(config: SimulationConfig, directory):
    """Create a NEW job directory, mesh, Elmer mesh database and solver input."""
    directory = Path(directory).resolve()
    # Exclusive mkdir prevents concurrent/repeated jobs from consuming stale results.
    directory.mkdir(parents=True, exist_ok=False)
    config = replace(config, step_file=str(Path(config.step_file).resolve()))
    _save(directory / "config.json", config.to_dict())
    status = dict(schema_version=1, status="meshing", directory=str(directory), started_at=time.time())
    _save(directory / "status.json", status)
    try:
        manifest = generate_mesh(config, directory)
        status["status"] = "converting"
        _save(directory / "status.json", status)
        _execute([config.solver.elmer_grid, "14", "2", "mesh.msh", "-out", "mesh"], directory,
                 "elmergrid.log", config.solver.timeout)
        _validate_mesh(directory, manifest)
        generate_sif(config, manifest, directory)
        (directory / "results").mkdir()
        status.update(status="prepared", mesh=manifest)
        _save(directory / "status.json", status)
        return status
    except Exception as exc:
        status.update(status="failed", error=str(exc), finished_at=time.time())
        _save(directory / "status.json", status)
        raise


def _validate_results(directory):
    files = sorted((directory / "results").glob("*.vtu"))
    if not files:
        raise RuntimeError("Elmer finished without VTU field results")
    for path in files:
        root = ET.parse(path).getroot()
        piece = root.find(".//Piece")
        if piece is None or int(piece.get("NumberOfPoints", "0")) == 0:
            raise RuntimeError(f"Empty field result: {path}")
        arrays = root.findall(".//PointData/DataArray")
        names = {a.get("Name", "").lower() for a in arrays}
        if not {"magnetic flux density", "magnetic field strength", "magnetic vector potential"}.issubset(names):
            raise RuntimeError(f"Required magnetic fields missing from {path}")
        for array in arrays:
            values = (array.text or "").split()
            expected = int(piece.get("NumberOfPoints")) * int(array.get("NumberOfComponents", "1"))
            if array.get("format", "ascii").lower() != "ascii" or len(values) != expected:
                raise RuntimeError(f"Incomplete or unsupported field array in {path}")
            if any(not math.isfinite(float(value)) for value in values):
                raise RuntimeError(f"Non-finite field values in {path}")
    return [str(path) for path in files]


def run(config: SimulationConfig, directory):
    """Run a complete job; return JSON-ready status and absolute field result paths."""
    status = prepare(config, directory)
    directory = Path(status["directory"])
    status["status"] = "solving"
    _save(directory / "status.json", status)
    try:
        output = _execute([config.solver.elmer_solver, "case.sif"], directory, "elmersolver.log", config.solver.timeout)
        if "ALL DONE" not in output:
            raise RuntimeError("Elmer did not report successful completion; see elmersolver.log")
        results = _validate_results(directory)
        try:
            from .fieldpreview import write_field_preview

            write_field_preview(directory)
        except (ValueError, OSError):
            pass
        status.update(status="completed", results=results, finished_at=time.time())
        _save(directory / "status.json", status)
        return status
    except Exception as exc:
        status.update(status="failed", error=str(exc), finished_at=time.time())
        _save(directory / "status.json", status)
        raise
