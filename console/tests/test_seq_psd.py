import os
import sys
import tempfile
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

console = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(console))
sys.path.insert(0, str(console / "external"))

_base = Path(tempfile.mkdtemp(prefix="adelpha-psd-"))
(_base / "config").mkdir()
(_base / "logs").mkdir()
os.environ["MRI4ALL_BASE"] = str(_base)

from common.qtcompat import configure_headless

configure_headless()

from common.plotting import extract_figure_series
from common.seq_psd import (
    count_block_events,
    count_trace_pulses,
    count_visible_events,
    find_seq_for_scan,
    psd_figure,
    write_psd_plot,
)

EXAMPLE_SEQ = console / "notebooks" / "acq" / "seq" / "rf_spin_echo_02516T.seq"
SE1D_SEQ = console / "notebooks" / "acq" / "seq" / "se_1d_projection_02516T.seq"
SE2D_SEQ = console / "notebooks" / "acq" / "seq" / "se_2d_inside_out_02516T.seq"


def _payload_for(path: Path):
    import pypulseq as pp

    seq = pp.Sequence()
    seq.read(str(path))
    fig = psd_figure(seq, title=path.name)
    payload = extract_figure_series(fig)
    assert payload is not None
    return seq, payload


def test_psd_figure_plots_every_block_channel():
    seq, payload = _payload_for(EXAMPLE_SEQ)
    assert len(payload["axes"]) == 5
    labels = [axis["ylabel"] for axis in payload["axes"]]
    assert labels == ["ADC", "RF mag (Hz)", "Gx (kHz/m)", "Gy (kHz/m)", "Gz (kHz/m)"]
    assert payload["axes"][0]["title"] == EXAMPLE_SEQ.name
    assert payload["axes"][-1]["xlabel"] == "time (ms)"
    rf = payload["axes"][1]
    rf_y = [y for y in rf["series"][0]["y"] if y is not None]
    assert any(abs(y) > 0 for y in rf_y)
    assert min(rf_y) == 0
    assert rf["ymin"] <= 0.05
    assert rf["ymax"] > 1000
    duration_ms = count_block_events(seq)["duration"] * 1e3
    assert payload["axes"][0]["xmin"] == 0
    assert abs(payload["axes"][0]["xmax"] - duration_ms) < 1e-3


def test_psd_figure_shows_trapezoid_gradients():
    _seq, payload = _payload_for(SE1D_SEQ)
    gx = payload["axes"][2]
    gx_y = [y for y in gx["series"][0]["y"] if y is not None]
    assert max(abs(y) for y in gx_y) > 100
    assert gx["ymax"] > 100
    assert gx["ymin"] < 0


def test_psd_includes_every_rf_adc_and_gradient_event():
    for path in (EXAMPLE_SEQ, SE1D_SEQ, SE2D_SEQ):
        seq, payload = _payload_for(path)
        expected = count_block_events(seq)
        visible = count_visible_events(seq)
        assert expected["blocks"] >= 1
        adc_y = payload["axes"][0]["series"][0]["y"]
        rf_y = payload["axes"][1]["series"][0]["y"]
        gx_y = payload["axes"][2]["series"][0]["y"]
        gy_y = payload["axes"][3]["series"][0]["y"]
        gz_y = payload["axes"][4]["series"][0]["y"]
        assert count_trace_pulses(adc_y, 0.5) == visible["adc"]
        assert count_trace_pulses(rf_y, 1.0) == visible["rf"]
        assert count_trace_pulses(gx_y, 1e-6) == visible["gx"]
        assert count_trace_pulses(gy_y, 1e-6) == visible["gy"]
        assert count_trace_pulses(gz_y, 1e-6) == visible["gz"]
        x = [v for v in payload["axes"][1]["series"][0]["x"] if v is not None]
        assert x[0] == 0
        assert abs(x[-1] - expected["duration"] * 1e3) < 1e-3
        assert expected["rf"] == visible["rf"]
        assert expected["adc"] == visible["adc"]


def test_write_psd_plot_pickles_a_figure(tmp_path):
    dest = tmp_path / "other" / "psd.plot"
    write_psd_plot(EXAMPLE_SEQ, dest, title=EXAMPLE_SEQ.name)
    assert dest.is_file()
    assert dest.stat().st_size > 100


def test_psd_roundtrip_plots_gz_with_gx_and_gy(tmp_path):
    import pypulseq as pp

    system = pp.Opts(
        max_grad=700000,
        grad_unit="Hz/m",
        rf_ringdown_time=20e-6,
        rf_dead_time=100e-6,
        adc_dead_time=20e-6,
        rf_raster_time=1e-6,
        grad_raster_time=10e-6,
    )
    seq = pp.Sequence(system)
    gx = pp.make_trapezoid(channel="x", amplitude=50000, rise_time=100e-6, flat_time=800e-6, system=system)
    gy = pp.make_trapezoid(channel="y", amplitude=-40000, rise_time=100e-6, flat_time=800e-6, system=system)
    gz = pp.make_trapezoid(channel="z", amplitude=35000, rise_time=100e-6, flat_time=800e-6, system=system)
    seq.add_block(gx, gy, gz)
    path = tmp_path / "xyz_traps.seq"
    seq.write(str(path))

    loaded = pp.Sequence()
    loaded.read(str(path))
    expected = count_block_events(loaded)
    assert expected["gx"] == 1
    assert expected["gy"] == 1
    assert expected["gz"] == 1

    payload = extract_figure_series(psd_figure(loaded, title=path.name))
    assert payload is not None
    gx_peak = max(abs(y) for y in payload["axes"][2]["series"][0]["y"] if y is not None)
    gy_peak = max(abs(y) for y in payload["axes"][3]["series"][0]["y"] if y is not None)
    gz_peak = max(abs(y) for y in payload["axes"][4]["series"][0]["y"] if y is not None)
    assert gx_peak > 1
    assert gy_peak > 1
    assert gz_peak > 1
    assert payload["axes"][4]["ylabel"] == "Gz (kHz/m)"
    assert payload["axes"][4]["ymax"] > 0
    assert payload["axes"][4]["ymin"] < 0


def test_find_seq_uses_library_only_when_scan_chose_a_file(tmp_path):
    from sequences.pulseq_file import stage_seq_file

    staged = stage_seq_file(EXAMPLE_SEQ)
    assert find_seq_for_scan(tmp_path, {"seq_file": "latest"}) == staged
    played = tmp_path / "seq" / "acq0.seq"
    played.parent.mkdir()
    played.write_bytes(b"placeholder")
    assert find_seq_for_scan(tmp_path, {"seq_file": "missing.seq"}) == played
    assert find_seq_for_scan(tmp_path, {}) == played
    assert find_seq_for_scan(tmp_path / "empty", {}) is None
