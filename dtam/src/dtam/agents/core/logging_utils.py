"""Structured logging helpers that avoid secrets and raw signal dumps."""

from __future__ import annotations

import logging
from typing import Any

from .config import get_settings


def configure_logging() -> None:
    level = getattr(logging, get_settings().log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def summarize_array(name: str, values: list[float] | None) -> dict[str, Any]:
    if not values:
        return {name: {"n": 0}}
    return {
        name: {
            "n": len(values),
            "min": min(values),
            "max": max(values),
            "mean": sum(values) / len(values),
        }
    }
