import json
import stat
import sys
from pathlib import Path

console = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(console))

from services.api.koma_sim import find_julia, run_suite


def test_unknown_suite_is_rejected():
    try:
        run_suite("not-a-suite")
    except ValueError as exc:
        assert "Unknown" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_unknown_sequence_is_rejected():
    try:
        run_suite("low-field", {"sequence": "epi"})
    except ValueError as exc:
        assert "sequence" in str(exc).lower()
    else:
        raise AssertionError("expected ValueError")


def test_missing_julia_is_reported(monkeypatch):
    monkeypatch.setenv("JULIA_BIN", "")
    monkeypatch.setattr("services.api.koma_sim.shutil.which", lambda _name: None)
    monkeypatch.setattr("services.api.koma_sim.Path.home", lambda: Path("/no/such/home"))
    assert find_julia() == ""
    try:
        run_suite("low-field")
    except RuntimeError as exc:
        assert "Julia" in str(exc)
    else:
        raise AssertionError("expected RuntimeError")


def test_runner_reads_suite_json(tmp_path, monkeypatch):
    julia = tmp_path / "fake-julia"
    julia.write_text(
        "#!/bin/sh\n"
        "out=\n"
        "for arg in \"$@\"; do\n"
        "  out=$arg\n"
        "done\n"
        "printf '%s' '{\"ok\":true,\"suite\":\"low-field\",\"echo\":[0,1],\"image\":null}' > \"$out\"\n",
        encoding="utf-8",
    )
    julia.chmod(julia.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("JULIA_BIN", str(julia))
    result = run_suite("low-field", {"sequence": "se", "b0_t": 0.5})
    assert result["suite"] == "low-field"
    assert result["echo"] == [0, 1]
    assert json.dumps(result)
