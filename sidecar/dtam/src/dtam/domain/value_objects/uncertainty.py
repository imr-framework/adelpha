"""Uncertainty representation for estimates and measurements."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator

from dtam.domain.exceptions import DomainError


class Uncertainty(BaseModel):
    """Explicit uncertainty attached to a quantity."""

    standard_deviation: float | None = Field(default=None, ge=0.0)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    notes: str | None = None

    model_config = {"frozen": True}

    @model_validator(mode="after")
    def _require_at_least_one_signal(self) -> Uncertainty:
        if self.standard_deviation is None and self.confidence is None:
            raise DomainError(
                "Uncertainty must include standard_deviation and/or confidence.",
            )
        return self
