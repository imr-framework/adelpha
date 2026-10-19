from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

from adelpha_runtime.__main__ import build_parser, main, run_script_child
from adelpha_runtime.workers import (
    is_runtime_executable,
    resolve_worker_python,
    venv_python,
    worker_argv,
)


def test_gateway_parser_rejects_script_arguments():
    with pytest.raises(SystemExit):
        build_parser().parse_args(
            [
                "/usr/lib/Adelpha/python-runtime/_internal/services/api/mrzero_sim.py",
                "/tmp/params.json",
                "/tmp/result.json",
            ]
        )


def test_run_script_child_executes_a_file(tmp_path):
    script = tmp_path / "hello.py"
    out = tmp_path / "out.txt"
    script.write_text("import sys\nopen(sys.argv[1], 'w', encoding='utf-8').write('ok')\n", encoding="utf-8")
    assert run_script_child([str(script), str(out)]) == 0
    assert out.read_text(encoding="utf-8") == "ok"


def test_main_run_script_skips_the_gateway(tmp_path):
    script = tmp_path / "hello.py"
    out = tmp_path / "out.txt"
    script.write_text("import sys\nopen(sys.argv[1], 'w', encoding='utf-8').write('ok')\n", encoding="utf-8")
    assert main(["run-script", str(script), str(out)]) == 0
    assert out.read_text(encoding="utf-8") == "ok"


def test_run_script_child_missing_file(tmp_path):
    assert run_script_child([str(tmp_path / "missing.py")]) == 2
    assert run_script_child([]) == 2


def test_worker_argv_uses_run_script_for_the_sidecar():
    command = worker_argv(
        "/usr/lib/Adelpha/python-runtime/adelpha-python-runtime",
        "/usr/lib/Adelpha/python-runtime/_internal/services/api/mrzero_sim.py",
        "/tmp/params.json",
        "/tmp/result.json",
    )
    assert command[1] == "run-script"
    assert command[-1] == "/tmp/result.json"


def test_worker_argv_keeps_ordinary_python():
    command = worker_argv(sys.executable, "sim.py", "a.json", "b.json")
    assert command == [sys.executable, "sim.py", "a.json", "b.json"]


def test_worker_argv_uses_run_script_when_this_process_is_frozen(monkeypatch):
    monkeypatch.setattr("adelpha_runtime.workers.frozen", lambda: True)
    monkeypatch.setattr(sys, "executable", "/Applications/Adelpha.app/Contents/Resources/python-runtime/adelpha-python-runtime")
    command = worker_argv(sys.executable, "sim.py", "a.json", "b.json")
    assert command[1] == "run-script"


def test_windows_runtime_exe_is_detected():
    assert is_runtime_executable(r"C:\Program Files\Adelpha\python-runtime\adelpha-python-runtime.exe")


def test_venv_python_finds_unix_and_windows_layouts(tmp_path, monkeypatch):
    unix = tmp_path / "unix" / "bin"
    unix.mkdir(parents=True)
    interpreter = unix / "python"
    interpreter.write_text("", encoding="utf-8")
    monkeypatch.setattr(os, "name", "posix")
    assert venv_python(tmp_path / "unix") == str(interpreter)

    windows = tmp_path / "win" / "Scripts"
    windows.mkdir(parents=True)
    exe = windows / "python.exe"
    exe.write_text("", encoding="utf-8")
    monkeypatch.setattr(os, "name", "nt")
    assert venv_python(tmp_path / "win") == str(exe)


def test_resolve_worker_python_prefers_env_then_venv_then_frozen(tmp_path, monkeypatch):
    monkeypatch.setenv("COILGEN_PYTHON", "/opt/custom/python")
    assert resolve_worker_python("COILGEN_PYTHON", tmp_path / "missing") == "/opt/custom/python"

    monkeypatch.delenv("COILGEN_PYTHON")
    bin_dir = tmp_path / "coil" / ".venv" / "bin"
    bin_dir.mkdir(parents=True)
    python = bin_dir / "python"
    python.write_text("", encoding="utf-8")
    monkeypatch.setattr(os, "name", "posix")
    assert resolve_worker_python("COILGEN_PYTHON", tmp_path / "coil" / ".venv") == str(python)

    monkeypatch.setattr("adelpha_runtime.workers.frozen", lambda: True)
    monkeypatch.setattr(sys, "executable", "/usr/lib/Adelpha/python-runtime/adelpha-python-runtime")
    assert resolve_worker_python("COILGEN_PYTHON", tmp_path / "absent") == sys.executable
