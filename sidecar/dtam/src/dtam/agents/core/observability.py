"""Lightweight ADK callbacks for observability.

ADK 2.6.x invokes agent callbacks as ``callback(callback_context=...)``.
"""

from __future__ import annotations

from typing import Any

from google.genai import types

from .logging_utils import get_logger

logger = get_logger("dtam.agents.adk")


def before_agent_callback(
    callback_context: Any = None, **_kwargs: Any
) -> types.Content | None:
    ctx = (
        callback_context
        if callback_context is not None
        else _kwargs.get("callback_context")
    )
    agent_name = getattr(ctx, "agent_name", None) or getattr(
        getattr(ctx, "agent", None), "name", "unknown"
    )
    logger.info("agent_start name=%s", agent_name)
    return None


def after_agent_callback(
    callback_context: Any = None, **_kwargs: Any
) -> types.Content | None:
    ctx = (
        callback_context
        if callback_context is not None
        else _kwargs.get("callback_context")
    )
    agent_name = getattr(ctx, "agent_name", None) or getattr(
        getattr(ctx, "agent", None), "name", "unknown"
    )
    logger.info("agent_end name=%s", agent_name)
    return None
