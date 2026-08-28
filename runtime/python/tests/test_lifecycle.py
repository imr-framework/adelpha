from __future__ import annotations

import os
import sys
import time

from adelpha_runtime.lock import RuntimeLock, RuntimeLockError
from adelpha_runtime.first_run import initialize_user_data
from adelpha_runtime.paths import resolve_paths
from adelpha_runtime.process import spawn_child
from adelpha_runtime.registry import ServiceRegistry
from adelpha_runtime.process import ServiceDef


def test_paths_with_spaces(isolated_data):
    paths = resolve_paths()
    assert " " in str(paths.data_dir)
    assert paths.data_dir.exists()
    assert paths.log_dir.exists()


def test_first_run_creates_directories(isolated_data):
    paths = resolve_paths()
    initialize_user_data(paths)
    assert (paths.data_dir / ".adelpha-initialized").is_file()
    assert (paths.data_dir / "mri4all" / "config").is_dir()
    initialize_user_data(paths)  # idempotent


def test_duplicate_lock_rejected(isolated_data):
    paths = resolve_paths()
    first = RuntimeLock(paths.data_dir)
    first.acquire()
    second = RuntimeLock(paths.data_dir)
    try:
        second.acquire()
        raise AssertionError("second lock should have failed")
    except RuntimeLockError:
        pass
    finally:
        first.release()


def test_child_process_cleanup():
    child = spawn_child([sys.executable, "-c", "import time; time.sleep(60)"], os.environ.copy())
    registry = ServiceRegistry(
        [
            ServiceDef(
                id="agents",
                title="Agents",
                required=False,
                start="lazy",
                restart="never",
                version="0.0",
                description="stub",
                child_factory=lambda _port: child,
            )
        ]
    )
    # The factory above would spawn a second child; instead attach the existing one.
    state = registry.states["agents"]
    state.child = child
    state.pid = child.pid
    state.status = "healthy"
    assert child.poll() is None
    registry.stop_all()
    deadline = time.time() + 5
    while time.time() < deadline and child.poll() is None:
        time.sleep(0.05)
    assert child.poll() is not None


def test_adk_apps_dir_checkout_layout(isolated_data):
    from adelpha_runtime.registry import _adk_apps_dir

    paths = resolve_paths()
    if paths.dtam_src is None:
        return
    cwd, apps = _adk_apps_dir(paths)
    assert apps in {".", "src"}
    assert (cwd / apps / "dtam" / "agents").is_dir()


def test_missing_dtam_is_actionable(isolated_data, monkeypatch):
    monkeypatch.delenv("ADELPHA_DTAM_SRC", raising=False)
    from adelpha_runtime.paths import RuntimePaths
    from adelpha_runtime.registry import build_registry

    paths = resolve_paths()
    broken = RuntimePaths(
        data_dir=paths.data_dir,
        config_dir=paths.config_dir,
        cache_dir=paths.cache_dir,
        log_dir=paths.log_dir,
        temp_dir=paths.temp_dir,
        resource_dir=paths.resource_dir,
        dtam_src=None,
        dtam_configs=None,
        console_root=None,
    )
    registry = build_registry(broken)
    registry.start("twin")
    assert registry.states["twin"].status == "error"
    detail = (registry.states["twin"].detail or "").lower()
    assert "dtam" in detail
    assert "make install" in detail or "not available" in detail
