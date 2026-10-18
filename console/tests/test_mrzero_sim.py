import json
import stat
from pathlib import Path

import pytest

console = Path(__file__).resolve().parents[1]


def test_studio_sequences_keep_their_parameters():
    import sys

    sys.path.insert(0, str(console))
    from services.api.mrzero_sim import low_field_request

    spin_echo = low_field_request({"sequence": "se_2D", "tr_ms": 100, "te_ms": 5, "bandwidth_hz": 250})
    assert spin_echo["sequence"] == "se_2D"
    assert spin_echo["te_ms"] == 5
    assert spin_echo["tr_ms"] == 100
    assert spin_echo["etl"] == 1

    turbo = low_field_request({"sequence": "tse_3D", "tr_ms": 1000, "te_ms": 15, "etl": 8, "bandwidth_hz": 1000})
    assert turbo["sequence"] == "tse_3D"
    assert turbo["etl"] == 8
    assert turbo["te_ms"] == 15
    assert turbo["tr_ms"] == 1000


def test_unknown_sequence_is_rejected():
    import sys

    sys.path.insert(0, str(console))
    from services.api.mrzero_sim import run_suite

    with pytest.raises(ValueError, match="MRZero"):
        run_suite("low-field", {"sequence": "epi"})


def test_unknown_suite_is_rejected():
    import sys

    sys.path.insert(0, str(console))
    from services.api.mrzero_sim import run_suite

    with pytest.raises(ValueError, match="Unknown"):
        run_suite("not-a-suite")


def test_runner_reads_result_json(tmp_path, monkeypatch):
    import sys

    sys.path.insert(0, str(console))
    from services.api import mrzero_sim

    def fake_run(command, **_kwargs):
        result = Path(command[-1])
        result.write_text(
            json.dumps({"ok": True, "suite": "low-field", "echo": [0, 1], "image": None}),
            encoding="utf-8",
        )
        return type("Proc", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr(mrzero_sim.subprocess, "run", fake_run)
    payload = mrzero_sim.run_suite("low-field", {"sequence": "se_2D", "te_ms": 5, "tr_ms": 100})
    assert payload["ok"] is True
    assert payload["echo"] == [0, 1]
