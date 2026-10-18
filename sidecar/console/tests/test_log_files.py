import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from common.logger import collect_log_lines


def test_console_log_reads_unknown_then_api(tmp_path):
    logs = tmp_path / "logs"
    logs.mkdir()
    (logs / "unknown.log").write_text("old | unknown | INF |  | MaRCoS at 10.0.0.1:11111\n", encoding="utf-8")
    (logs / "api.log").write_text("new | api | INF |  | Acquisition pipeline running\n", encoding="utf-8")

    lines = collect_log_lines("api", base=str(tmp_path))
    assert lines == [
        "old | unknown | INF |  | MaRCoS at 10.0.0.1:11111",
        "new | api | INF |  | Acquisition pipeline running",
    ]


def test_console_log_falls_back_to_unknown(tmp_path):
    logs = tmp_path / "logs"
    logs.mkdir()
    (logs / "unknown.log").write_text("only | unknown | INF |  | Sequence registry loaded\n", encoding="utf-8")

    lines = collect_log_lines("api", base=str(tmp_path))
    assert lines == ["only | unknown | INF |  | Sequence registry loaded"]


def test_missing_log_is_empty(tmp_path):
    (tmp_path / "logs").mkdir()
    assert collect_log_lines("api", base=str(tmp_path)) == []
    assert collect_log_lines("acq", base=str(tmp_path)) == []


def test_clear_log_truncates_active_and_removes_rotations(tmp_path):
    logs = tmp_path / "logs"
    logs.mkdir()
    (logs / "unknown.log").write_text("old history\n", encoding="utf-8")
    (logs / "api.log").write_text("new history\n", encoding="utf-8")
    (logs / "api.log.1").write_text("rotated\n", encoding="utf-8")

    from common.logger import clear_log_files

    assert clear_log_files("api", base=str(tmp_path)) == 3
    assert (logs / "unknown.log").read_text(encoding="utf-8") == ""
    assert (logs / "api.log").read_text(encoding="utf-8") == ""
    assert not (logs / "api.log.1").exists()
    assert collect_log_lines("api", base=str(tmp_path)) == []
