from __future__ import annotations

import os
import sys
from pathlib import Path
from types import TracebackType

from adelpha_runtime.paths import LOCK_NAME


class RuntimeLockError(RuntimeError):
    pass


class RuntimeLock:
    """Single-instance lock so two supervisors do not share one data directory."""

    def __init__(self, data_dir: Path) -> None:
        data_dir.mkdir(parents=True, exist_ok=True)
        self.path = data_dir / LOCK_NAME
        self._fp = None

    def acquire(self) -> None:
        self._fp = open(self.path, "a+", encoding="utf-8")
        try:
            if sys.platform == "win32":
                import msvcrt

                self._fp.seek(0)
                msvcrt.locking(self._fp.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(self._fp.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise RuntimeLockError(
                f"Adelpha Python runtime is already running (lock {self.path})"
            ) from exc
        self._fp.seek(0)
        self._fp.truncate()
        self._fp.write(str(os.getpid()))
        self._fp.flush()

    def release(self) -> None:
        if self._fp is None:
            return
        try:
            if sys.platform == "win32":
                import msvcrt

                self._fp.seek(0)
                msvcrt.locking(self._fp.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(self._fp.fileno(), fcntl.LOCK_UN)
        except OSError:
            pass
        try:
            self._fp.close()
        finally:
            self._fp = None
            try:
                self.path.unlink(missing_ok=True)
            except OSError:
                pass

    def __enter__(self) -> RuntimeLock:
        self.acquire()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.release()
