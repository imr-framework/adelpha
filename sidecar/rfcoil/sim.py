"""Solenoid RF coil windings from the VUIIS ILP optimizer.

The Engineering Studio calls this for a uniform on-axis B1 solenoid.
PuLP/CBC and SciPy live in RFcoilbuilder/.venv so they stay out of the API process.
Source: RFcoilbuilder/coil_optimisation_v1.3_DIYMRI.py
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

DEFAULTS = {
    "radius_mm": 30.0,
    "length_mm": 180.0,
    "former_mm": 5.0,
    "grooves": 45,
    "freq_mhz": 10.64,
    "allow_bucking": True,
    "n_max": 1,
}

LIMITS = {
    "radius_mm": (10.0, 150.0),
    "length_mm": (40.0, 400.0),
    "former_mm": (1.0, 20.0),
    "grooves": (8.0, 80.0),
    "freq_mhz": (0.5, 128.0),
    "n_max": (1.0, 4.0),
}

WIRE_DIAMETER_BARE = 0.812e-3
WIRE_RADIUS_BARE = WIRE_DIAMETER_BARE / 2
WIRE_DIAMETER_INSULATED = 0.879e-3
EVAL_FRACTION = 0.8
LOOP_SEGMENTS = 48


def _number(body: dict, key: str) -> float:
    lo, hi = LIMITS[key]
    raw = body.get(key, DEFAULTS[key])
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{key} must be a number.") from exc
    if not math.isfinite(value):
        raise ValueError(f"{key} must be a finite number.")
    return min(hi, max(lo, value))


def rfcoil_request(body: dict | None) -> dict:
    payload = body or {}
    bucking = payload.get("allow_bucking", DEFAULTS["allow_bucking"])
    if isinstance(bucking, str):
        bucking = bucking.strip().lower() not in {"0", "false", "no", "off"}
    return {
        "radius_mm": _number(payload, "radius_mm"),
        "length_mm": _number(payload, "length_mm"),
        "former_mm": _number(payload, "former_mm"),
        "grooves": int(round(_number(payload, "grooves"))),
        "freq_mhz": _number(payload, "freq_mhz"),
        "allow_bucking": bool(bucking),
        "n_max": int(round(_number(payload, "n_max"))),
    }


def rfcoil_python() -> str:
    here = Path(__file__).resolve().parent
    try:
        from adelpha_runtime.workers import resolve_worker_python
    except ImportError:
        override = os.environ.get("RFCOIL_PYTHON", "").strip()
        if override:
            return override
        root = here.parent / "RFcoilbuilder" / ".venv"
        for candidate in (root / "bin" / "python", root / "bin" / "python3", root / "Scripts" / "python.exe"):
            if candidate.is_file():
                return str(candidate)
        return sys.executable if getattr(sys, "frozen", False) else ""
    return resolve_worker_python(
        "RFCOIL_PYTHON",
        here.parent / "RFcoilbuilder" / ".venv",
        here / ".venv",
    )


def _worker_command(python: str, params: Path, result: Path) -> list[str]:
    script = Path(__file__).resolve()
    try:
        from adelpha_runtime.workers import worker_argv
        return worker_argv(python, script, str(params), str(result))
    except ImportError:
        if Path(python.replace("\\", "/")).name.lower().removesuffix(".exe") == "adelpha-python-runtime":
            return [python, "run-script", str(script), str(params), str(result)]
        return [python, str(script), str(params), str(result)]


def _release_memory() -> None:
    import gc

    try:
        import matplotlib.pyplot as plt

        plt.close("all")
    except Exception:
        pass
    gc.collect()


def run_rfcoil(body: dict | None = None) -> dict:
    request = rfcoil_request(body)
    python = rfcoil_python()
    if not python:
        raise RuntimeError("The RF coil environment is missing. Install PuLP with CBC in RFcoilbuilder/.venv.")
    try:
        with tempfile.TemporaryDirectory(prefix="adelpha-rfcoil-") as tmp:
            params = Path(tmp) / "params.json"
            result = Path(tmp) / "result.json"
            params.write_text(json.dumps(request), encoding="utf-8")
            env = os.environ.copy()
            env["PYTHONPATH"] = ""
            env["MPLBACKEND"] = "Agg"
            env.setdefault("OPENBLAS_NUM_THREADS", "1")
            env.setdefault("VECLIB_MAXIMUM_THREADS", "1")
            env.setdefault("OMP_NUM_THREADS", "1")
            env["MPLCONFIGDIR"] = str(Path(tmp) / "mpl")
            proc = subprocess.run(
                _worker_command(python, params, result),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                env=env,
                timeout=180,
                cwd=tmp,
            )
            if not result.exists():
                detail = (proc.stderr or "RF coil optimization failed.").strip()
                raise RuntimeError(detail[-800:])
            payload = json.loads(result.read_text(encoding="utf-8"))
        if not payload.get("ok"):
            raise RuntimeError(str(payload.get("error") or "RF coil optimization failed."))
        return payload
    finally:
        _release_memory()


def _b1_single_loop_on_axis(loop_z, loop_radius, eval_z, mu_0):
    import numpy as np

    dz = eval_z - loop_z
    return mu_0 * loop_radius**2 / (2.0 * (loop_radius**2 + dz**2) ** 1.5)


def _optimize_windings(b_matrix, b_target, n_max: int, allow_bucking: bool):
    """Same max-relative-error ILP as the VUIIS script; HiGHS first, CBC if present."""
    lower = -n_max if allow_bucking else 0
    try:
        return _optimize_windings_milp(b_matrix, b_target, n_max, lower)
    except ImportError:
        return _optimize_windings_pulp(b_matrix, b_target, n_max, lower)


def _optimize_windings_milp(b_matrix, b_target, n_max: int, lower: int):
    import numpy as np
    from scipy.optimize import Bounds, LinearConstraint, milp

    n_pts, n_grooves = b_matrix.shape
    cost = np.zeros(n_grooves + 1)
    cost[-1] = 1.0
    rows = np.zeros((2 * n_pts, n_grooves + 1))
    upper = np.zeros(2 * n_pts)
    rows[:n_pts, :n_grooves] = b_matrix
    rows[:n_pts, -1] = -b_target
    upper[:n_pts] = b_target
    rows[n_pts:, :n_grooves] = -b_matrix
    rows[n_pts:, -1] = -b_target
    upper[n_pts:] = -b_target
    result = milp(
        c=cost,
        constraints=LinearConstraint(rows, -np.inf, upper),
        bounds=Bounds([float(lower)] * n_grooves + [0.0], [float(n_max)] * n_grooves + [np.inf]),
        integrality=[1] * n_grooves + [0],
        options={"time_limit": 120},
    )
    if result.x is None or not getattr(result, "success", False):
        raise RuntimeError(result.message or "The RF coil optimizer did not find a winding pattern.")
    windings = [int(round(value)) for value in result.x[:n_grooves]]
    error = float(result.x[-1])
    if not math.isfinite(error):
        raise RuntimeError("The RF coil optimizer did not report a field error.")
    return windings, error


def _add_var(problem, name: str, low, up, cat):
    """PuLP 2 constructed variables; PuLP 4 requires ``problem.add_variable``."""
    if hasattr(problem, "add_variable"):
        return problem.add_variable(name, lowBound=low, upBound=up, cat=cat)
    from pulp import LpVariable

    return LpVariable(name, lowBound=low, upBound=up, cat=cat)


def _optimize_windings_pulp(b_matrix, b_target, n_max: int, lower: int):
    from pulp import COIN_CMD, LpContinuous, LpInteger, LpMinimize, LpProblem, lpSum, value

    n_pts, n_grooves = b_matrix.shape
    problem = LpProblem("RF_Coil_Opt", LpMinimize)
    n_vars = [_add_var(problem, f"n_{index}", lower, n_max, LpInteger) for index in range(n_grooves)]
    epsilon = _add_var(problem, "eps", 0, None, LpContinuous)
    problem += epsilon
    for row in range(n_pts):
        field = lpSum(b_matrix[row, col] * n_vars[col] for col in range(n_grooves))
        problem += field - b_target[row] <= epsilon * b_target[row]
        problem += b_target[row] - field <= epsilon * b_target[row]
    solver = COIN_CMD(msg=0, timeLimit=120)
    available = solver.available() if hasattr(solver, "available") else True
    if available is False:
        raise RuntimeError("CBC solver is unavailable. Install pulp[cbc] in RFcoilbuilder/.venv.")
    problem.solve(solver)
    windings = []
    for var in n_vars:
        raw = value(var)
        if raw is None:
            raise RuntimeError("The RF coil optimizer did not return a winding pattern. Try fewer grooves or a longer coil.")
        windings.append(int(round(raw)))
    error = value(epsilon)
    if error is None or not math.isfinite(float(error)):
        raise RuntimeError("The RF coil optimizer did not report a field error.")
    return windings, float(error)


def _self_inductance_loop(radius, wire_radius, mu_0):
    import numpy as np

    return mu_0 * radius * (np.log(8.0 * radius / wire_radius) - 2.0)


def _mutual_inductance_coaxial(r1, r2, distance, mu_0):
    import numpy as np
    from scipy.special import ellipe, ellipk

    if distance < 1e-10 and abs(r1 - r2) < 1e-10:
        return _self_inductance_loop(r1, r1 * 0.001, mu_0) * 0.99
    k_sq = min(4.0 * r1 * r2 / ((r1 + r2) ** 2 + distance**2), 0.999999)
    k = np.sqrt(k_sq)
    return mu_0 * np.sqrt(r1 * r2) * ((2.0 / k - k) * ellipk(k_sq) - (2.0 / k) * ellipe(k_sq))


def _expand_turns(n_windings, groove_positions, coil_radius, former_thickness, wire_dia_ins):
    turns = []
    for index, count in enumerate(n_windings):
        if count == 0:
            continue
        sign = 1 if count > 0 else -1
        for layer in range(abs(int(count))):
            turns.append(
                {
                    "z": float(groove_positions[index]),
                    "R": coil_radius + former_thickness + wire_dia_ins * (layer + 0.5),
                    "sign": sign,
                    "groove": index,
                }
            )
    return turns


def _inductance(turns, wire_radius, wire_dia_ins, mu_0):
    import numpy as np
    from scipy.special import ellipe, ellipk

    n_turns = len(turns)
    if n_turns == 0:
        return 0.0, 0.0, 0.0
    matrix = np.zeros((n_turns, n_turns))
    for i, turn_i in enumerate(turns):
        matrix[i, i] = _self_inductance_loop(turn_i["R"], wire_radius, mu_0)
        for j in range(i + 1, n_turns):
            turn_j = turns[j]
            distance = abs(turn_i["z"] - turn_j["z"])
            r1, r2 = turn_i["R"], turn_j["R"]
            if distance < 1e-10 and abs(r1 - r2) < 1e-10:
                mutual = matrix[i, i] * 0.98
            elif distance < 1e-10:
                k_sq = min(4.0 * r1 * r2 / ((r1 + r2) ** 2 + (wire_dia_ins * 0.1) ** 2), 0.999999)
                k = np.sqrt(k_sq)
                mutual = mu_0 * np.sqrt(r1 * r2) * ((2.0 / k - k) * ellipk(k_sq) - (2.0 / k) * ellipe(k_sq))
            else:
                mutual = _mutual_inductance_coaxial(r1, r2, distance, mu_0)
            matrix[i, j] = mutual
            matrix[j, i] = mutual
    signs = np.array([turn["sign"] for turn in turns], dtype=float)
    total = float(signs @ matrix @ signs)
    self_total = float(np.trace(matrix))
    return total, self_total, total - self_total


def _circle_points(radius: float, z: float) -> list[list[float]]:
    import numpy as np

    theta = np.linspace(0.0, 2.0 * np.pi, LOOP_SEGMENTS, endpoint=False)
    return [[float(radius * np.cos(angle)), float(radius * np.sin(angle)), float(z)] for angle in theta]


def _cylinder_mesh(radius: float, length: float) -> tuple[list[list[float]], list[list[int]], list[list[float]]]:
    import numpy as np

    n_theta = 32
    n_z = 8
    zs = np.linspace(-length / 2.0, length / 2.0, n_z)
    vertices: list[list[float]] = []
    colors: list[list[float]] = []
    for z in zs:
        for index in range(n_theta):
            angle = 2.0 * np.pi * index / n_theta
            vertices.append([float(radius * np.cos(angle)), float(radius * np.sin(angle)), float(z)])
            colors.append([0.6, 0.58, 0.66])
    faces: list[list[int]] = []
    for ring in range(n_z - 1):
        for index in range(n_theta):
            a = ring * n_theta + index
            b = ring * n_theta + (index + 1) % n_theta
            c = (ring + 1) * n_theta + index
            d = (ring + 1) * n_theta + (index + 1) % n_theta
            faces.append([a, b, d])
            faces.append([a, d, c])
    return vertices, faces, colors


def winding_layout(n_windings, groove_positions, coil_radius, former_thickness, wire_dia_ins, wire_radius):
    """Closed circular turns on a cylinder. Bore axis is Z."""
    import numpy as np

    wires = []
    for index, count in enumerate(n_windings):
        if count == 0:
            continue
        group = 0 if count > 0 else 1
        z = float(groove_positions[index])
        for layer in range(int(abs(count))):
            radius = coil_radius + former_thickness + wire_dia_ins * (layer + 0.5)
            wires.append({"group": group, "closed": True, "points": _circle_points(radius, z)})
    axial = abs(float(groove_positions[-1] - groove_positions[0])) if len(groove_positions) > 1 else float(coil_radius)
    vertices, faces, colors = _cylinder_mesh(coil_radius, axial if axial > 0 else float(coil_radius))
    stream = np.asarray(n_windings, dtype=float)
    span = max(float(coil_radius) * 2.0, axial)
    return {
        "vertices": vertices,
        "faces": faces,
        "colors": colors,
        "wires": wires,
        "wire_radius": round(max(float(wire_radius), span * 0.011, 1e-4), 5),
        "stream_min": float(np.min(stream)) if stream.size else 0.0,
        "stream_max": float(np.max(stream)) if stream.size else 0.0,
    }


def _figure_png(draw) -> str:
    import base64
    from io import BytesIO

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    try:
        figure = draw()
        buffer = BytesIO()
        figure.savefig(buffer, format="png", dpi=140, bbox_inches="tight", facecolor="white")
        return base64.b64encode(buffer.getvalue()).decode("ascii")
    except Exception:
        return ""
    finally:
        plt.close("all")


def _field_figure(eval_z, target, achieved, valid, max_error, groove_positions, n_windings, n_max, n_min):
    import matplotlib.patches as mpatches
    import matplotlib.pyplot as plt
    import numpy as np

    figure, axes = plt.subplots(3, 1, figsize=(10.5, 8.6))
    axes[0].plot(eval_z * 100, target * 1e6, "b-", lw=2, label="Target · uniform")
    axes[0].plot(eval_z * 100, achieved * 1e6, "r--", lw=2, label="Achieved")
    axes[0].set_xlabel("Axial position (cm)")
    axes[0].set_ylabel("B₁ (µT/A)")
    axes[0].set_title("Target vs achieved B₁ (on axis)")
    axes[0].legend(fontsize=9)
    axes[0].grid(True, alpha=0.3)

    rel = np.zeros_like(eval_z)
    rel[valid] = (achieved[valid] - target[valid]) / target[valid]
    axes[1].plot(eval_z[valid] * 100, rel[valid] * 100, "k-", lw=1.4)
    axes[1].axhline(0, color="gray", ls="--")
    axes[1].set_xlabel("Axial position (cm)")
    axes[1].set_ylabel("Relative error (%)")
    axes[1].set_title(f"Relative error (max = {max_error * 100:.2f}%)")
    axes[1].grid(True, alpha=0.3)

    colors = ["#2171B5" if n > 0 else ("#CB181D" if n < 0 else "#CCCCCC") for n in n_windings]
    width = 0.7 * np.min(np.abs(np.diff(np.sort(groove_positions)))) * 100 if len(groove_positions) > 1 else 1
    axes[2].bar(np.asarray(groove_positions) * 100, n_windings, width=width, color=colors, edgecolor="black", lw=0.4)
    axes[2].axhline(0, color="black", lw=0.8)
    axes[2].set_xlabel("Groove position (cm)")
    axes[2].set_ylabel("Windings")
    axes[2].set_ylim(n_min - 1, n_max + 1)
    axes[2].grid(True, alpha=0.3, axis="y")
    axes[2].legend(
        handles=[mpatches.Patch(color="#2171B5", label="Forward"), mpatches.Patch(color="#CB181D", label="Bucking")],
        fontsize=9,
    )
    figure.tight_layout()
    return figure


def _side_figure(coil_radius, coil_length, former, wire_dia, groove_positions, n_windings, inductance_h, q_factor, cap_f, freq_hz):
    import matplotlib.patches as mpatches
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    import numpy as np

    r_cm = coil_radius * 100
    length_cm = coil_length * 100
    former_cm = former * 100
    wire_cm = wire_dia * 100
    vis = max(wire_cm / 2, r_cm * 0.025)
    layers = max(int(np.max(np.abs(n_windings))), 1)
    outer = r_cm + former_cm + layers * wire_cm
    figure, ax = plt.subplots(1, 1, figsize=(11.5, 5.6))
    ax.add_patch(Rectangle((-length_cm / 2, r_cm), length_cm, former_cm, ec="saddlebrown", fc="wheat", lw=1.2, zorder=1))
    ax.add_patch(Rectangle((-length_cm / 2, -r_cm - former_cm), length_cm, former_cm, ec="saddlebrown", fc="wheat", lw=1.2, zorder=1))
    ax.axhline(0, color="gray", ls="-.", lw=0.5, zorder=0)
    for pos, count in zip(groove_positions, n_windings):
        if count == 0:
            continue
        fill = "#2171B5" if count > 0 else "#CB181D"
        edge = "#08306B" if count > 0 else "#67000D"
        for layer in range(abs(int(count))):
            radial = r_cm + former_cm + wire_cm * (layer + 0.5)
            ax.add_patch(plt.Circle((pos * 100, radial), vis, fc=fill, ec=edge, lw=0.4, zorder=3))
            ax.add_patch(plt.Circle((pos * 100, -radial), vis, fc=fill, ec=edge, lw=0.4, zorder=3))
    ax.set_title(
        f"Solenoid RF coil · L={inductance_h * 1e6:.1f} µH · Q≈{q_factor:.0f} · "
        f"C={cap_f * 1e12:.0f} pF @ {freq_hz / 1e6:.3f} MHz"
    )
    ax.set_xlabel("Axial position (cm)")
    ax.set_ylabel("Radial position (cm)")
    ax.set_aspect("equal")
    pad = max(length_cm * 0.12, 3)
    ax.set_xlim(-length_cm / 2 - pad, length_cm / 2 + pad + r_cm * 0.2)
    ax.set_ylim(-(outer + r_cm * 0.35), outer + r_cm * 0.28)
    ax.grid(True, alpha=0.2)
    ax.legend(
        handles=[
            mpatches.Patch(fc="#2171B5", ec="#08306B", label="Forward"),
            mpatches.Patch(fc="#CB181D", ec="#67000D", label="Bucking"),
            mpatches.Patch(fc="wheat", ec="saddlebrown", label="Former"),
        ],
        loc="lower right",
        fontsize=8,
    )
    figure.tight_layout()
    return figure


def simulate(request: dict) -> dict:
    import time

    import numpy as np
    from scipy.constants import mu_0

    started = time.perf_counter()
    coil_radius = request["radius_mm"] / 1000.0
    coil_length = request["length_mm"] / 1000.0
    former = request["former_mm"] / 1000.0
    grooves = int(request["grooves"])
    n_max = int(request["n_max"])
    n_min = -n_max if request["allow_bucking"] else 0
    freq_hz = request["freq_mhz"] * 1e6
    groove_positions = np.linspace(-coil_length / 2.0, coil_length / 2.0, grooves)
    eval_z = np.linspace(-coil_length / 2.0 * EVAL_FRACTION, coil_length / 2.0 * EVAL_FRACTION, 60)
    b_matrix = np.column_stack([_b1_single_loop_on_axis(z, coil_radius, eval_z, mu_0) for z in groove_positions])
    scale = float(np.mean(b_matrix.sum(axis=1)) * 0.5)
    target = np.ones_like(eval_z) * scale
    valid = target > 1e-12
    n_windings, max_error = _optimize_windings(b_matrix[valid, :], target[valid], n_max, request["allow_bucking"])
    n_windings = np.asarray(n_windings, dtype=int)
    if int(np.sum(np.abs(n_windings))) == 0:
        raise RuntimeError("The optimizer placed no turns. Increase coil length or allow bucking and retry.")
    turns = _expand_turns(n_windings, groove_positions, coil_radius, former, WIRE_DIAMETER_INSULATED)
    inductance, _self_l, _mutual = _inductance(turns, WIRE_RADIUS_BARE, WIRE_DIAMETER_INSULATED, mu_0)
    omega = 2 * np.pi * freq_hz
    capacitance = 1.0 / (omega**2 * inductance) if inductance > 0 else float("inf")
    rho_cu = 1.68e-8
    skin = math.sqrt(2 * rho_cu / (omega * mu_0))
    wire_length = sum(2 * math.pi * turn["R"] for turn in turns)
    r_dc = rho_cu * wire_length / (math.pi * WIRE_RADIUS_BARE**2) if wire_length > 0 else 0.0
    r_ac = rho_cu * wire_length / (2 * math.pi * WIRE_RADIUS_BARE * skin) if WIRE_RADIUS_BARE > skin else r_dc
    q_factor = omega * inductance / r_ac if r_ac > 0 else 0.0
    achieved = b_matrix @ n_windings
    layout = winding_layout(n_windings, groove_positions, coil_radius, former, WIRE_DIAMETER_INSULATED, WIRE_DIAMETER_INSULATED / 2)
    field_png = _figure_png(
        lambda: _field_figure(eval_z, target, achieved, valid, max_error, groove_positions, n_windings, n_max, n_min)
    )
    side_png = _figure_png(
        lambda: _side_figure(coil_radius, coil_length, former, WIRE_DIAMETER_INSULATED, groove_positions, n_windings, inductance, q_factor, capacitance, freq_hz)
    )
    forward = int(np.maximum(n_windings, 0).sum())
    bucking = int(np.abs(np.minimum(n_windings, 0)).sum())
    error_percent = round(abs(max_error) * 100.0, 2)
    payload = {
        "ok": True,
        "generator_version": 1,
        "title": "Solenoid RF coil",
        "summary": "Integer winding pattern for a uniform on-axis B1 solenoid.",
        "radius_mm": request["radius_mm"],
        "length_mm": request["length_mm"],
        "former_mm": request["former_mm"],
        "grooves": grooves,
        "freq_mhz": request["freq_mhz"],
        "allow_bucking": request["allow_bucking"],
        "n_max": n_max,
        "mean_field_error": error_percent,
        "error_definition": "Maximum relative |B1 − target| / target on axis over 80% of coil length",
        "inductance_uh": round(inductance * 1e6, 3) if math.isfinite(inductance) else None,
        "q_factor": round(q_factor, 1) if math.isfinite(q_factor) else None,
        "tuning_pf": round(capacitance * 1e12, 1) if math.isfinite(capacitance) else None,
        "wire_length_m": round(wire_length, 3),
        "forward_turns": forward,
        "bucking_turns": bucking,
        "layout": layout,
        "layout_png": side_png,
        "surface_png": field_png,
        "field_png": field_png,
        "loop_count": len(layout["wires"]),
        "elapsed_s": round(time.perf_counter() - started, 3),
    }
    del n_windings, turns, layout, b_matrix, achieved, target
    _release_memory()
    return payload


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: rfcoil_sim.py params.json result.json")
    destination = Path(sys.argv[2])
    try:
        request = rfcoil_request(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")))
        payload = simulate(request)
    except Exception as exc:
        import traceback

        detail = traceback.format_exc().strip().splitlines()
        payload = {"ok": False, "error": f"{exc}\n{detail[-1]}" if detail else str(exc)}
    finally:
        _release_memory()
    destination.write_text(json.dumps(payload), encoding="utf-8")
    raise SystemExit(0 if payload.get("ok") else 1)


if __name__ == "__main__":
    main()
