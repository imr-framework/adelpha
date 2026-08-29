"""Shared quantity typing for twin states (measured vs estimated vs predicted)."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class QuantitySource(str, Enum):
    MEASURED = "measured"
    ESTIMATED = "estimated"
    PREDICTED = "predicted"
    NOMINAL = "nominal"


class TimestampedQuantity(BaseModel):
    """A scalar twin quantity with explicit provenance of how it was obtained."""

    value: float
    unit: str
    source: QuantitySource
    timestamp: datetime
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    uncertainty_std: float | None = Field(default=None, ge=0.0)
    model_version: str | None = None
    channel_id: str | None = None

    model_config = {"frozen": True}
