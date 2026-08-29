"""Shared tool result and metadata helpers."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field

ToolFn = Callable[..., dict[str, Any]]


class ToolKind(str, Enum):
    READ_ONLY = "read_only"
    MUTATING = "mutating"


class ToolResult(BaseModel):
    """Structured envelope returned by DTAM domain tools."""

    ok: bool
    tool: str
    data: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    error_code: str | None = None
    correlation_id: str = Field(default_factory=lambda: str(uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def as_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


def ok_result(tool: str, **data: Any) -> dict[str, Any]:
    return ToolResult(ok=True, tool=tool, data=data).as_dict()


def error_result(
    tool: str,
    message: str,
    *,
    error_code: str = "TOOL_ERROR",
    **data: Any,
) -> dict[str, Any]:
    return ToolResult(
        ok=False,
        tool=tool,
        data=data,
        error=message,
        error_code=error_code,
    ).as_dict()
