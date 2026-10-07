"""Run the Engineering Studio acquisition with MRZero.

2D spin echo and 3D turbo spin echo are Bloch-simulated with MRzeroCore.
The studio still receives one reconstructed slice, a noisy copy, and a
field-error copy. Torch stays in a subprocess so the API process does not
import it.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path

SEQUENCES = ("se_2D", "tse_3D")
NAMES = {"se_2D": "2D Spin-Echo", "tse_3D": "3D Turbo Spin-Echo"}
PHANTOM_URL = "https://github.com/MRsources/MRzero-Core/raw/main/documentation/playground_mr0/numerical_brain_cropped.mat"
FOV_M = 0.22
MATRIX = 32

DEFAULTS = {
    "sequence": "se_2D",
    "b0_t": 0.5,
    "inhomogeneity_ppm": 20.0,
    "gmax_mt_m": 15.0,
    "tr_ms": 100.0,
    "te_ms": 5.0,
    "flip_deg": 90.0,
    "averages": 1.0,
    "voxel_mm": 1.0,
    "bandwidth_hz": 250.0,
}

LIMITS = {
    "b0_t": (0.05, 1.0),
    "inhomogeneity_ppm": (0.0, 80.0),
    "gmax_mt_m": (5.0, 40.0),
    "tr_ms": (4.0, 4000.0),
    "te_ms": (1.0, 800.0),
    "flip_deg": (5.0, 180.0),
    "averages": (1.0, 8.0),
    "voxel_mm": (0.4, 20.0),
    "bandwidth_hz": (40.0, 4000.0),
}


def _clamp(body: dict, key: str) -> float:
    lo, hi = LIMITS[key]
    raw = body.get(key, DEFAULTS[key])
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{key} must be a number.") from exc
    if not math.isfinite(value):
        raise ValueError(f"{key} must be a finite number.")
    return min(hi, max(lo, value))


def _extra_int(body: dict, key: str, default: int, lo: int, hi: int) -> int:
    raw = body.get(key, default)
    try:
        value = int(round(float(raw)))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{key} must be a number.") from exc
    return min(hi, max(lo, value))


def low_field_request(body: dict | None) -> dict:
    payload = body or {}
    sequence = str(payload.get("sequence") or DEFAULTS["sequence"])
    if sequence not in SEQUENCES:
        raise ValueError("MRZero simulates the 2D spin echo and the 3D turbo spin echo.")
    request = {"sequence": sequence}
    for key in LIMITS:
        request[key] = _clamp(payload, key)
    request["te_ms"] = min(request["te_ms"], request["tr_ms"])
    request["averages"] = int(round(request["averages"]))
    request["etl"] = _extra_int(payload, "etl", 8 if sequence == "tse_3D" else 1, 1, 16)
    if sequence != "tse_3D":
        request["etl"] = 1
    return request


def run_suite(suite: str, body: dict | None = None) -> dict:
    if suite != "low-field":
        raise ValueError(f"Unknown suite '{suite}'.")
    request = low_field_request(body)
    with tempfile.TemporaryDirectory(prefix="adelpha-mr0-") as tmp:
        params = Path(tmp) / "params.json"
        result = Path(tmp) / "result.json"
        params.write_text(json.dumps(request), encoding="utf-8")
        env = os.environ.copy()
        env["PYTHONPATH"] = ""
        env["MPLBACKEND"] = "Agg"
        env["MPLCONFIGDIR"] = str(Path(tmp) / "mpl")
        proc = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), str(params), str(result)],
            capture_output=True,
            text=True,
            env=env,
            timeout=600,
            cwd=tmp,
        )
        if not result.exists():
            detail = (proc.stderr or proc.stdout or "MRZero simulation failed.").strip()
            raise RuntimeError(detail[-800:])
        payload = json.loads(result.read_text(encoding="utf-8"))
    if not payload.get("ok"):
        raise RuntimeError(str(payload.get("error") or "MRZero simulation failed."))
    return payload


def _shim_typing() -> None:
    import typing

    if hasattr(typing, "Self"):
        return
    from typing_extensions import Self

    typing.Self = Self


def _phantom_file() -> Path:
    from urllib.request import urlretrieve

    cache = Path.home() / ".cache" / "adelpha" / "mr0"
    cache.mkdir(parents=True, exist_ok=True)
    dest = cache / "numerical_brain_cropped.mat"
    if not dest.exists():
        urlretrieve(PHANTOM_URL, dest)
    return dest


def _delay(pp, system, seconds: float):
    step = float(system.grad_raster_time)
    snapped = math.floor(max(0.0, seconds) / step) * step
    if snapped < step:
        return None
    return pp.make_delay(snapped)


def _snap_flat(system, samples: int, flat: float) -> float:
    adc = float(system.adc_raster_time)
    grad = float(system.grad_raster_time)
    step = samples * adc
    steps = max(1, round(flat / step))
    while steps < 100000:
        duration = steps * step
        if abs(duration / grad - round(duration / grad)) < 1e-3:
            return duration
        steps += 1
    return flat


def _readout(pp, system, samples: int, fov: float, bandwidth: float, te: float, t180: float, tpre: float):
    requested = _snap_flat(system, samples, max(4e-4, samples / bandwidth))
    flat = requested
    for _ in range(6):
        gx = pp.make_trapezoid(channel="x", flat_area=samples / fov, flat_time=flat, system=system)
        center = float(gx.rise_time) + float(gx.flat_time) / 2
        room = te / 2 - t180 / 2 - tpre - center
        if room >= -1e-5:
            return gx
        flat = _snap_flat(system, samples, max(4e-4, flat + 2 * room - 2e-4))
    raise ValueError("TE is shorter than this spin echo allows. Raise TE.")


def _build_sequence(request: dict):
    import numpy as np
    import pypulseq as pp

    samples = MATRIX
    fov = FOV_M
    te = float(request["te_ms"]) * 1e-3
    tr = float(request["tr_ms"]) * 1e-3
    etl = int(request["etl"])
    system = pp.Opts(
        max_grad=float(request["gmax_mt_m"]),
        grad_unit="mT/m",
        max_slew=40,
        slew_unit="T/m/s",
        rf_ringdown_time=20e-6,
        rf_dead_time=100e-6,
        adc_dead_time=10e-6,
    )
    rf90 = pp.make_block_pulse(
        flip_angle=math.pi / 2,
        duration=100e-6,
        delay=system.rf_dead_time,
        system=system,
        use="excitation",
    )
    rf180 = pp.make_block_pulse(
        flip_angle=math.pi,
        duration=100e-6,
        delay=system.rf_dead_time,
        phase_offset=math.pi / 2,
        system=system,
        use="refocusing",
    )
    t180 = float(pp.calc_duration(rf180))
    tpre = 8e-4
    gx = _readout(pp, system, samples, fov, float(request["bandwidth_hz"]), te, t180, tpre)
    adc = pp.make_adc(num_samples=samples, duration=gx.flat_time, delay=gx.rise_time, system=system)
    gx_pre = pp.make_trapezoid(channel="x", area=-gx.area / 2, duration=tpre, system=system)
    spoil = pp.make_trapezoid(channel="z", area=16 * samples / fov, system=system)
    seq = pp.Sequence(system)
    pe_order: list[int] = []
    groups = [list(range(start, min(samples, start + etl))) for start in range(0, samples, etl)]
    excite = float(rf90.delay) + float(getattr(rf90, "shape_dur", rf90.t[-1])) / 2
    refocus = float(rf180.delay) + float(getattr(rf180, "shape_dur", rf180.t[-1])) / 2
    read_center = float(gx.rise_time) + float(gx.flat_time) / 2

    def play(lines: list[int], record: bool) -> None:
        clock = 0.0

        def add(*events):
            nonlocal clock
            seq.add_block(*events)
            clock += float(pp.calc_duration(*events))

        def wait_until(target: float) -> None:
            gap = _delay(pp, system, target - clock)
            if target - clock < -1e-4:
                raise ValueError("TE is shorter than this spin echo allows. Raise TE.")
            if gap is not None:
                add(gap)

        add(rf90)
        for index, line in enumerate(lines):
            wait_until(excite + te / 2 + index * te - refocus)
            add(rf180)
            ky = (line - samples / 2) / fov
            gy = pp.make_trapezoid(channel="y", area=ky, duration=tpre, system=system)
            gy_rew = pp.make_trapezoid(channel="y", area=-ky, duration=tpre, system=system)
            wait_until(excite + (index + 1) * te - read_center - tpre)
            add(gx_pre, gy)
            wait_until(excite + (index + 1) * te - read_center)
            add(gx, adc)
            add(gx_pre, gy_rew)
            if record:
                pe_order.append(line)
        add(spoil)
        if clock - tr > 1e-4:
            raise ValueError("TR is shorter than this echo train. Raise TR or lower the echo train.")
        tail = _delay(pp, system, tr - clock)
        if tail is not None:
            add(tail)

    for _steady in range(2):
        play([], False)
    for lines in groups:
        play(lines, True)

    ok, report = seq.check_timing()
    if not ok:
        detail = report if isinstance(report, str) else "; ".join(str(item) for item in report)
        raise ValueError(detail or "The pulse sequence timing is not playable.")
    return seq, pe_order, np


def _simulate_once(mr0, seq, phantom):
    data = phantom.build()
    graph = mr0.compute_graph(seq, data, 200, 1e-3)
    signal = mr0.execute_graph(graph, seq, data, 1e-3, 1e-3, print_progress=False)
    return signal.detach().cpu().numpy().reshape(-1)


def _prepare_phantom(mr0, torch, request: dict, scale: float):
    samples = MATRIX
    phantom = mr0.VoxelGridPhantom.load_mat(str(_phantom_file()))
    phantom = phantom.interpolate(samples, samples, 1)
    phantom.D = phantom.D * 0
    phantom.size = torch.tensor([FOV_M, FOV_M, 5e-3])
    coords = torch.linspace(-0.5, 0.5, samples).view(samples, 1, 1)
    span = 42.57747892e6 * float(request["b0_t"]) * float(request["inhomogeneity_ppm"]) * 1e-6
    phantom.B0 = coords.expand_as(phantom.B0) * span * scale
    return phantom


def _image(values, samples: int) -> dict:
    flat = [round(float(value), 5) for value in values.reshape(-1)]
    return {"width": samples, "height": samples, "values": flat}


def _reconstruct(np, samples: np.ndarray, pe_order: list[int], samples_n: int):
    raw = samples.reshape(len(pe_order), samples_n)
    kspace = np.zeros((samples_n, samples_n), dtype=np.complex64)
    for line, index in zip(raw, pe_order):
        kspace[index] = line
    image = np.fft.fftshift(np.fft.ifft2(np.fft.ifftshift(kspace)))
    magnitude = np.abs(image).astype(np.float64)
    center_index = pe_order.index(samples_n // 2) if samples_n // 2 in pe_order else len(pe_order) // 2
    echo = np.abs(raw[center_index])
    peak = float(echo.max()) or 1.0
    return magnitude, [round(float(value) / peak, 4) for value in echo]


def simulate(request: dict) -> dict:
    import time

    import numpy as np
    import torch
    import MRzeroCore as mr0

    torch.set_grad_enabled(False)
    started = time.perf_counter()
    samples = MATRIX
    seq, pe_order, _np = _build_sequence(request)
    with tempfile.TemporaryDirectory(prefix="adelpha-mr0-seq-") as tmp:
        path = str(Path(tmp) / "sequence.seq")
        seq.write(path)
        seq0 = mr0.Sequence.import_file(path)
    uniform_phantom = _prepare_phantom(mr0, torch, request, 0.0)
    spins = int(torch.count_nonzero(uniform_phantom.PD > 1e-6))
    uniform = _simulate_once(mr0, seq0, uniform_phantom)
    if uniform.size != len(pe_order) * samples:
        raise RuntimeError(f"MRZero returned {uniform.size} samples for {len(pe_order)} profiles.")
    magnitude, echo = _reconstruct(np, uniform, pe_order, samples)
    rng = np.random.default_rng(1)
    sigma = 0.045 * float(magnitude.max() or 1.0) / math.sqrt(request["averages"])
    noisy = np.clip(magnitude + rng.normal(0.0, sigma, magnitude.shape), 0.0, None)
    if float(request["inhomogeneity_ppm"]) > 0:
        shifted = _simulate_once(mr0, seq0, _prepare_phantom(mr0, torch, request, 1.0))
        inhomogeneous, _echo = _reconstruct(np, shifted, pe_order, samples)
    else:
        inhomogeneous = magnitude
    center = magnitude[samples // 4 : 3 * samples // 4, samples // 4 : 3 * samples // 4]
    snr = float(np.mean(center) / (sigma or 1e-6))
    shots = math.ceil(samples / int(request["etl"]))
    elapsed = time.perf_counter() - started
    return {
        "ok": True,
        "suite": "low-field",
        "title": NAMES[request["sequence"]],
        "summary": "MRZero phase-distribution graph, one brain slice.",
        "phantom": "numerical brain",
        "spins": spins,
        "profiles": len(pe_order),
        "samples_per_profile": samples,
        "scanner_b0_t": request["b0_t"],
        "gmax_mt_m": request["gmax_mt_m"],
        "inhomogeneity_ppm": request["inhomogeneity_ppm"],
        "sequence": NAMES[request["sequence"]],
        "sequence_id": request["sequence"],
        "tr_ms": request["tr_ms"],
        "te_ms": request["te_ms"],
        "flip_deg": request["flip_deg"],
        "averages": request["averages"],
        "voxel_mm": round(FOV_M * 1000 / samples, 3),
        "fov_mm": round(FOV_M * 1000, 1),
        "matrix": samples,
        "bandwidth_hz": request["bandwidth_hz"],
        "scan_time_s": round(shots * request["tr_ms"] * request["averages"] / 1000, 3),
        "snr": round(snr, 2),
        "elapsed_s": round(elapsed, 3),
        "echo": echo,
        "image": _image(magnitude, samples),
        "noisy_image": _image(noisy, samples),
        "inhomogeneous_image": _image(inhomogeneous, samples),
        "reconstruction_error": "",
    }


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: mrzero_sim.py params.json result.json")
    destination = Path(sys.argv[2])
    try:
        _shim_typing()
        request = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
        payload = simulate(request)
    except Exception as exc:
        payload = {"ok": False, "error": str(exc)}
    destination.write_text(json.dumps(payload), encoding="utf-8")
    raise SystemExit(0 if payload.get("ok") else 1)


if __name__ == "__main__":
    main()
