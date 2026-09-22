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

from common.parameter_schema import param, schema_for_defaults
from sequences import SequenceBase


class _UiDemo(SequenceBase, registry_key=""):
    param_TE: int = 10
    param_gain = param(1.5, title="Gain", unit="dB", tab="adjustments", minimum=0)
    param_mode = param("fast", title="Mode", enum=("fast", "slow"), tab="other")
    parameter_ui = {
        "TE": {"title": "Echo time"},
    }


def test_param_star_fields_become_console_inputs():
    defaults = _UiDemo.get_default_parameters()
    assert defaults["TE"] == 10
    assert defaults["gain"] == 1.5
    assert defaults["mode"] == "fast"
    schema = _UiDemo.get_parameter_schema()
    props = schema["properties"]
    assert props["TE"]["unit"] == "ms"
    assert props["TE"]["title"] == "Echo time"
    assert props["TE"]["tab"] == "sequence"
    assert props["gain"]["tab"] == "adjustments"
    assert props["gain"]["unit"] == "dB"
    assert props["mode"]["enum"] == ["fast", "slow"]
    assert props["mode"]["tab"] == "other"


def test_set_parameters_writes_param_attributes():
    inst = _UiDemo()
    ok = inst.set_parameters({"TE": 20, "gain": "2.5", "mode": "slow"}, scan_task=None)
    assert ok
    assert inst.param_TE == 20
    assert inst.param_gain == 2.5
    assert inst.get_parameters()["mode"] == "slow"


def test_schema_for_defaults_merges_extra_meta():
    schema = schema_for_defaults(
        {"N_ITER": 3},
        extra_meta={"N_ITER": {"title": "Iterations", "tab": "adjust", "minimum": 1}},
    )
    prop = schema["properties"]["N_ITER"]
    assert prop["title"] == "Iterations"
    assert prop["tab"] == "adjustments"
    assert prop["minimum"] == 1


def test_file_widget_is_exported_in_schema():
    schema = schema_for_defaults(
        {"seq_file": "latest"},
        extra_meta={"seq_file": {"title": "Sequence file", "widget": "file", "accept": ".seq"}},
    )
    prop = schema["properties"]["seq_file"]
    assert prop["widget"] == "file"
    assert prop["accept"] == ".seq"
    assert prop["type"] == "string"


def test_pulseq_file_schema_uses_file_picker():
    from sequences.pulseq_file import SequencePulseqFile

    schema = SequencePulseqFile.get_parameter_schema()
    prop = schema["properties"]["seq_file"]
    assert prop["widget"] == "file"
    assert prop["accept"] == ".seq"


def test_stage_seq_file_copies_into_library():
    from sequences import pulseq_file

    library = pulseq_file.library_dir()
    source = library.parent / "demo.seq"
    source.write_text("# demo\n", encoding="utf-8")
    dest = pulseq_file.stage_seq_file(source)
    assert dest == library / "demo.seq"
    assert dest.read_text(encoding="utf-8") == "# demo\n"
    assert (library / "LATEST").read_text(encoding="utf-8") == "demo.seq"
    assert pulseq_file.resolve_seq_file("latest") == dest
    assert pulseq_file.resolve_seq_file("demo") == dest
    assert pulseq_file.library_filename("../evil.seq") == "evil.seq"


def test_import_seq_file_rejects_non_seq():
    from services.api.sequences_api import import_seq_file

    try:
        import_seq_file("notes.txt", b"not a sequence")
    except ValueError as exc:
        assert "Choose a .seq file" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_import_seq_file_rejects_unreadable():
    from services.api.sequences_api import import_seq_file

    try:
        import_seq_file("bad.seq", b"not pulseq")
    except ValueError as exc:
        assert "could not read" in str(exc).lower()
    else:
        raise AssertionError("expected ValueError")


def test_import_seq_file_stages_a_valid_sequence():
    import math
    import pypulseq as pp
    from services.api.sequences_api import import_seq_file

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
    path = _base / "valid.seq"
    seq.write(str(path))

    name = import_seq_file("valid.seq", path.read_bytes())
    assert name == "valid.seq"
    from sequences.pulseq_file import resolve_seq_file

    staged = resolve_seq_file(name)
    assert staged is not None
    assert staged.name == "valid.seq"
