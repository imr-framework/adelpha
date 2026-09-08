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
