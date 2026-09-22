"""Pulse-sequence diagram: ADC, RF, and gradients vs time for every block."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, Optional

import numpy as np


def _event(block: Any, name: str) -> Any:
    return getattr(block, name, None)


def _trap_waveform(grad: Any) -> tuple[np.ndarray, np.ndarray]:
    t = np.cumsum(
        [
            0.0,
            float(getattr(grad, "delay", 0.0) or 0.0),
            float(getattr(grad, "rise_time", 0.0) or 0.0),
            float(getattr(grad, "flat_time", 0.0) or 0.0),
            float(getattr(grad, "fall_time", 0.0) or 0.0),
        ]
    )
    y = 1e-3 * float(grad.amplitude) * np.array([0.0, 0.0, 1.0, 1.0, 0.0])
    return t, y


def _arb_waveform(grad: Any) -> tuple[np.ndarray, np.ndarray]:
    t_shape = np.asarray(grad.t, dtype=float)
    wave = np.asarray(grad.waveform, dtype=float)
    delay = float(getattr(grad, "delay", 0.0) or 0.0)
    if t_shape.size < 2:
        return delay + t_shape, 1e-3 * wave
    dt = t_shape[1] - t_shape[0]
    t = delay + np.concatenate(([0.0], t_shape + dt / 2.0, [t_shape[-1] + dt]))
    first = float(getattr(grad, "first", wave[0] if wave.size else 0.0))
    last = float(getattr(grad, "last", wave[-1] if wave.size else 0.0))
    return t, 1e-3 * np.concatenate(([first], wave, [last]))


def _closed_pulse(t: Iterable[float], y: Iterable[float]) -> tuple[np.ndarray, np.ndarray]:
    """Drop RF envelopes to zero at the edges so short pulses read as spikes from the baseline."""
    t_arr = np.asarray(list(t), dtype=float)
    y_arr = np.asarray(list(y), dtype=float)
    if t_arr.size == 0:
        return t_arr, y_arr
    return np.concatenate(([t_arr[0]], t_arr, [t_arr[-1]])), np.concatenate(([0.0], y_arr, [0.0]))


def _finite_peak(values: Iterable[float]) -> float:
    arr = np.asarray(list(values), dtype=float)
    arr = arr[np.isfinite(arr)]
    return float(np.max(np.abs(arr))) if arr.size else 0.0


def _set_channel_limits(ax, values: Iterable[float], *, symmetric: bool, empty_span: float) -> None:
    peak = _finite_peak(values)
    if peak <= 0:
        ax.set_ylim(-empty_span, empty_span) if symmetric else ax.set_ylim(0.0, empty_span)
        return
    pad = peak * 0.15
    if symmetric:
        ax.set_ylim(-(peak + pad), peak + pad)
    else:
        ax.set_ylim(0.0, peak + pad)


def _append_segment(times: list[float], values: list[float], t: Iterable[float], y: Iterable[float]) -> None:
    """Append a waveform, holding the previous value so delay-only blocks stay on the timeline."""
    t_arr = np.asarray(list(t), dtype=float).ravel()
    y_arr = np.asarray(list(y), dtype=float).ravel()
    if t_arr.size == 0 or y_arr.size == 0:
        return
    if t_arr.size != y_arr.size:
        n = min(t_arr.size, y_arr.size)
        t_arr, y_arr = t_arr[:n], y_arr[:n]
    if times and t_arr[0] > times[-1] + 1e-12:
        times.append(float(t_arr[0]))
        values.append(values[-1])
    times.extend(float(v) for v in t_arr)
    values.extend(float(v) for v in y_arr)


def _span_full_duration(times: list[float], values: list[float], t_end: float) -> None:
    if t_end <= 0:
        t_end = 1e-6
    if not times:
        times.extend([0.0, t_end])
        values.extend([0.0, 0.0])
        return
    if times[0] > 1e-12:
        times.insert(0, 0.0)
        values.insert(0, 0.0)
    if times[-1] < t_end - 1e-12:
        times.append(t_end)
        values.append(values[-1])


def iter_blocks(seq: Any) -> Iterator[tuple[Any, Any, float, float]]:
    """Yield `(block_id, block, t0, duration)` for every block, in file order."""
    from pypulseq.calc_duration import calc_duration

    block_ids = list(seq.dict_block_events.keys())
    durations = getattr(seq, "arr_block_durations", None)
    t0 = 0.0
    for i, block_id in enumerate(block_ids):
        block = seq.get_block(block_id)
        if durations is not None and i < len(durations):
            dur = float(durations[i])
        else:
            dur = float(calc_duration(block))
        yield block_id, block, t0, dur
        t0 += dur


def count_visible_events(seq: Any) -> Dict[str, int]:
    """Channel events that produce a non-zero pulse on the PSD (zero-area PE blips stay on the baseline)."""
    counts = {"adc": 0, "rf": 0, "gx": 0, "gy": 0, "gz": 0}
    for _block_id, block, _t0, _dur in iter_blocks(seq):
        if _event(block, "adc") is not None:
            counts["adc"] += 1
        rf = _event(block, "rf")
        if rf is not None and float(np.max(np.abs(np.asarray(rf.signal)))) > 0:
            counts["rf"] += 1
        for name in ("gx", "gy", "gz"):
            grad = _event(block, name)
            if grad is None:
                continue
            if getattr(grad, "type", "") == "grad":
                wave = np.asarray(getattr(grad, "waveform", []), dtype=float)
                peak = float(np.max(np.abs(wave))) if wave.size else 0.0
            else:
                peak = abs(float(getattr(grad, "amplitude", 0.0) or 0.0))
            if peak > 0:
                counts[name] += 1
    return counts


def count_block_events(seq: Any) -> Dict[str, float]:
    """How many blocks and channel events the sequence actually contains."""
    counts: Dict[str, float] = {"blocks": 0, "adc": 0, "rf": 0, "gx": 0, "gy": 0, "gz": 0, "duration": 0.0}
    t_end = 0.0
    for _block_id, block, t0, dur in iter_blocks(seq):
        counts["blocks"] += 1
        t_end = t0 + dur
        for name in ("adc", "rf", "gx", "gy", "gz"):
            if _event(block, name) is not None:
                counts[name] += 1
    counts["duration"] = t_end
    return counts


def count_trace_pulses(values: Iterable[float | None], threshold: float) -> int:
    """Count baseline → active edges so PSD traces can be checked against the block table."""
    arr = np.array([0.0 if v is None or not np.isfinite(v) else float(v) for v in values], dtype=float)
    active = np.abs(arr) > threshold
    if active.size == 0:
        return 0
    return int(np.sum(active & np.concatenate(([False], ~active[:-1]))))


def psd_figure(seq: Any, title: str = ""):
    """Classic 5-panel timing diagram of every sequence block, time in milliseconds."""
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(5, 1, sharex=True, figsize=(11, 8), constrained_layout=True)
    ax_adc, ax_rf, ax_gx, ax_gy, ax_gz = axes
    traces = {
        ax_adc: ([], []),
        ax_rf: ([], []),
        ax_gx: ([], []),
        ax_gy: ([], []),
        ax_gz: ([], []),
    }

    t_end = 0.0
    for _block_id, block, t0, dur in iter_blocks(seq):
        t_end = t0 + dur

        adc = _event(block, "adc")
        if adc is not None:
            start = t0 + float(adc.delay)
            end = start + float(adc.num_samples) * float(adc.dwell)
            _append_segment(traces[ax_adc][0], traces[ax_adc][1], [start, start, end, end], [0.0, 1.0, 1.0, 0.0])

        rf = _event(block, "rf")
        if rf is not None:
            delay = float(getattr(rf, "delay", 0.0) or 0.0)
            t = t0 + delay + np.asarray(rf.t, dtype=float)
            t, mag = _closed_pulse(t, np.abs(rf.signal))
            _append_segment(traces[ax_rf][0], traces[ax_rf][1], t, mag)

        for ax, name in ((ax_gx, "gx"), (ax_gy, "gy"), (ax_gz, "gz")):
            grad = _event(block, name)
            if grad is None:
                continue
            t, y = _arb_waveform(grad) if getattr(grad, "type", "") == "grad" else _trap_waveform(grad)
            _append_segment(traces[ax][0], traces[ax][1], t0 + t, y)

    for times, values in traces.values():
        _span_full_duration(times, values, t_end)

    t_end_ms = max(t_end * 1e3, 1e-3)
    for ax, (times, values) in traces.items():
        ax.plot(np.asarray(times) * 1e3, values, lw=1.75)
        ax.set_xlim(0.0, t_end_ms)

    ax_adc.set_ylim(-0.08, 1.15)
    _set_channel_limits(ax_rf, traces[ax_rf][1], symmetric=False, empty_span=1.0)
    grad_peak = max(_finite_peak(traces[ax][1]) for ax in (ax_gx, ax_gy, ax_gz))
    for ax in (ax_gx, ax_gy, ax_gz):
        _set_channel_limits(ax, [grad_peak], symmetric=True, empty_span=1.0)

    ax_adc.set_ylabel("ADC")
    ax_rf.set_ylabel("RF mag (Hz)")
    ax_gx.set_ylabel("Gx (kHz/m)")
    ax_gy.set_ylabel("Gy (kHz/m)")
    ax_gz.set_ylabel("Gz (kHz/m)")
    ax_gz.set_xlabel("time (ms)")
    if title:
        ax_adc.set_title(title)
    return fig


def write_psd_plot(seq_path: Path, dest: Path, title: str = "") -> Path:
    """Read a .seq file, pickle a themed PSD figure, and return `dest`."""
    import pickle

    import matplotlib

    matplotlib.use("Agg")
    import pypulseq as pp

    from common.plotting import apply_plot_theme

    seq = pp.Sequence()
    seq.read(str(seq_path))
    fig = psd_figure(seq, title=title or seq_path.name)
    apply_plot_theme(fig)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "wb") as handle:
        pickle.dump(fig, handle)
    try:
        import matplotlib.pyplot as plt

        plt.close(fig)
    except Exception:
        pass
    return dest


def find_seq_for_scan(folder: Path, parameters: Optional[dict] = None) -> Optional[Path]:
    """Library file only when this scan chose one; otherwise the scan's own `seq/acq0.seq`.

    Do not fall back to the global ``latest`` pointer — that belongs to Run .seq file
    and would hide gradients on every other queued sequence.
    """
    from sequences.pulseq_file import resolve_seq_file

    params = parameters or {}
    played = Path(folder) / "seq" / "acq0.seq"
    if "seq_file" in params:
        library = resolve_seq_file(str(params.get("seq_file") or "latest"))
        if library is not None:
            return library
    return played if played.is_file() else None
