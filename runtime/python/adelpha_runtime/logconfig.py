from __future__ import annotations

import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from adelpha_runtime.paths import RUNTIME_VERSION

SESSION_ID = ""
_SECRET_RE = re.compile(
    r"(?i)(api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+"
)


def set_session_id(value: str) -> None:
    global SESSION_ID
    SESSION_ID = value


def redact(text: str) -> str:
    redacted = _SECRET_RE.sub(r"\1=[redacted]", text)
    for key in ("GOOGLE_API_KEY", "ADELPHA_SESSION_TOKEN"):
        value = os.environ.get(key, "")
        if value:
            redacted = redacted.replace(value, "[redacted]")
    return redacted


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "severity": record.levelname,
            "source": record.name,
            "pid": record.process,
            "session": SESSION_ID,
            "message": redact(record.getMessage()),
        }
        if record.exc_info:
            payload["error"] = redact(self.formatException(record.exc_info))
        return json.dumps(payload, default=str)


def configure_logging(log_dir: Path, *, level: str = "INFO") -> Path:
    log_dir.mkdir(parents=True, exist_ok=True)
    path = log_dir / "supervisor.log"
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    root.handlers.clear()

    file_handler = logging.FileHandler(path, encoding="utf-8")
    file_handler.setFormatter(JsonFormatter())
    stream = logging.StreamHandler(sys.stderr)
    stream.setFormatter(JsonFormatter())
    root.addHandler(file_handler)
    root.addHandler(stream)
    logging.getLogger("adelpha.runtime").info(
        "supervisor logging ready version=%s file=%s", RUNTIME_VERSION, path
    )
    return path
