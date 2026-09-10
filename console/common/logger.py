import logging, sys, os, re
from logging.handlers import RotatingFileHandler
from pathlib import Path

import common.runtime as rt

# Global logger instance
logger = None
logger_setup_complete = False


class TaskIDFilter(logging.Filter):
    """
    This is a filter which injects information about the active task ID into the log
    """

    def filter(self, record):
        record.taskID = rt.get_current_task_id()
        return True


def get_logger():
    """Returns an instance of the logger service."""
    global logger_setup_complete
    global logger

    if not logger_setup_complete:
        logger = logging.getLogger(rt.service_name)
        logger_setup_complete = True
        logger.setLevel(get_loglevel())
        logger.addFilter(TaskIDFilter())
        logging.addLevelName(logging.NOTSET, "NOT")
        logging.addLevelName(logging.DEBUG, "DBG")
        logging.addLevelName(logging.INFO, "INF")
        logging.addLevelName(logging.WARNING, "WRN")
        logging.addLevelName(logging.ERROR, "ERR")
        logging.addLevelName(logging.CRITICAL, "CTL")
        formatter = logging.Formatter(
            "%(asctime)s | %(name)s | %(levelname)s | %(taskID)s | %(message)s"
        )

        # Create console handler
        ch = logging.StreamHandler()
        ch.setFormatter(formatter)
        logger.addHandler(ch)

        log_dir = os.path.join(rt.get_base_path(), "logs")
        os.makedirs(log_dir, exist_ok=True)
        file_handler = RotatingFileHandler(
            os.path.join(log_dir, f"{rt.service_name}.log"),
            maxBytes=1500000,
            backupCount=5,
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

        return logger
    return logger


def _log_stems(name: str) -> tuple[str, ...]:
    if name == "api":
        return ("unknown", "api")
    return (name,)


def collect_log_lines(name: str, base: str | None = None, limit: int = 2000) -> list[str]:
    """Return recent lines for the Log Viewer.

    Adelpha mounts the console API in-process and historically wrote ``unknown.log``
    because the service name was never set. Console still reads that file so
    existing sessions are not empty.
    """
    _require_log_name(name)
    lines: list[str] = []
    for path in _active_log_files(name, base):
        try:
            lines.extend(path.read_text(encoding="utf-8", errors="replace").splitlines())
        except OSError:
            continue
    return lines[-limit:]


def clear_log_files(name: str, base: str | None = None) -> int:
    """Erase the on-disk history for a Log Viewer source."""
    _require_log_name(name)
    cleared = 0
    for path in _log_files(name, base):
        try:
            if path.name.endswith(".log"):
                path.write_text("", encoding="utf-8")
            else:
                path.unlink()
            cleared += 1
        except OSError:
            continue
    _reopen_file_handlers()
    return cleared


def _require_log_name(name: str) -> None:
    if name not in {"acq", "recon", "ui", "api"}:
        raise ValueError(f"Unknown log {name}")


def _active_log_files(name: str, base: str | None = None) -> list[Path]:
    root = Path(base or rt.get_base_path()) / "logs"
    return [root / f"{stem}.log" for stem in _log_stems(name) if (root / f"{stem}.log").is_file()]


def _log_files(name: str, base: str | None = None) -> list[Path]:
    root = Path(base or rt.get_base_path()) / "logs"
    found: list[Path] = []
    for stem in _log_stems(name):
        active = root / f"{stem}.log"
        if active.is_file():
            found.append(active)
        found.extend(sorted(path for path in root.glob(f"{stem}.log.*") if path.is_file()))
    return found


def _reopen_file_handlers() -> None:
    log = logger
    if log is None:
        return
    for handler in list(log.handlers):
        if isinstance(handler, RotatingFileHandler):
            handler.close()
            handler.stream = handler._open()


def get_loglevel() -> int:
    """Returns the logging level that should be used for printing messages."""
    if any(re.findall(r"pytest|py.test", sys.argv[0])):
        return logging.DEBUG

    level = os.getenv("MRI4ALL_LOG_LEVEL", "info").lower()
    if rt.is_debugging_enabled():
        level = "debug"

    if level == "error":
        return logging.ERROR
    if level == "info":
        return logging.INFO
    if level == "debug":
        return logging.DEBUG

    return logging.INFO


class LoggerStdCapture:
    def __init__(self, level):
        self.level = level

    def write(self, message):
        # The check for empty lines reduces the amount printed to the logger
        if message != "\n":
            self.level(message)

    def flush(self):
        pass
        # self.level(sys.stderr)
