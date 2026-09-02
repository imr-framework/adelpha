import os
import sys
import tempfile
from pathlib import Path

console = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(console))
sys.path.insert(0, str(console / "external"))

_base = Path(tempfile.mkdtemp(prefix="adelpha-seq-"))
(_base / "config").mkdir()
(_base / "logs").mkdir()
os.environ["MRI4ALL_BASE"] = str(_base)

from common.qtcompat import configure_headless

configure_headless()

from sequences import SequenceBase
from sequences.common.pydanticConfig import MarcosParameters


def test_sequence_registry_loads_updated_catalog():
    names = SequenceBase.installed_sequences()
    assert "rf_se" in names
    assert "se_1D" in names
    rf_se = SequenceBase.get_sequence("rf_se")
    schema = rf_se.get_parameter_schema()
    assert schema["properties"]["TE"]["unit"] == "ms"
    se_1d = SequenceBase.get_sequence("se_1D")
    se_schema = se_1d.get_parameter_schema()
    assert se_schema["properties"]["FOV"]["unit"] == "mm"
    assert se_schema["properties"]["debug_plot"]["type"] == "boolean"


def test_marcos_defaults_keep_adelpha_gpa_off():
    params = MarcosParameters()
    assert params.initialize_gpa is False
    assert params.fpga_clock_frequency_MHz == 122.88


def test_native_seq2flocra_accepts_adelpha_calibrations():
    from external.flocra_pulseq.interpreter_pp import seq2flocra

    psi = seq2flocra(
        center_freq=11.4235e6,
        rf_amp_max=5000,
        clk_freq=122.88,
        gx_max=700000,
        gy_max=800000,
        gz_max=1000000,
        tx_t=1,
        grad_t=10,
    )
    assert psi._center_freq == 11.4235e6
    assert abs(psi._clk_freq - 122.88e6) < 1.0
    assert psi._rf_amp_max == 5000
    assert psi._gx_max == 700000
    assert psi._gy_max == 800000
    assert psi._gz_max == 1000000


def test_native_seq2flocra_compiles_a_seq_file(tmp_path):
    import math
    import pypulseq as pp
    from external.flocra_pulseq.interpreter_pp import seq2flocra

    system = pp.Opts(
        max_grad=700000,
        grad_unit="Hz/m",
        rf_ringdown_time=20e-6,
        rf_dead_time=100e-6,
        rf_raster_time=1e-6,
        adc_dead_time=20e-6,
    )
    seq = pp.Sequence(system)
    rf = pp.make_block_pulse(
        flip_angle=math.pi / 2,
        duration=200e-6,
        delay=100e-6,
        system=system,
        use="excitation",
    )
    adc = pp.make_adc(num_samples=64, duration=3.2e-3, delay=20e-6, system=system)
    seq.add_block(rf)
    seq.add_block(adc)
    seq_path = tmp_path / "adelpha_flocra.seq"
    seq.write(str(seq_path))

    psi = seq2flocra(
        center_freq=11.4235e6,
        rf_amp_max=5000,
        system=system,
        clk_freq=122.88,
        gx_max=700000,
        gy_max=800000,
        gz_max=1000000,
    )
    psi.load_seqfile(str(seq_path))
    psi.block_events_to_amps_times()
    assert "tx0" in psi._flo_dict
    assert "rx0_en" in psi._flo_dict
    assert psi._flo_dict["tx0"][0].shape[0] >= 2
    assert psi._rx_t > 0
