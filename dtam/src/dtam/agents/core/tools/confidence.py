"""Confidence adjustment helpers."""

from __future__ import annotations

from ..enums import ConfidenceLevel


def adjust_confidence(
    base: float,
    *,
    missing_fields: int = 0,
    contradictory: bool = False,
    outlier_fraction: float = 0.0,
) -> float:
    """Deterministically adjust confidence in [0, 1]."""
    if not 0.0 <= base <= 1.0:
        raise ValueError("base confidence must be in [0, 1]")
    score = base
    score -= 0.08 * max(0, missing_fields)
    score -= 0.15 * max(0.0, min(1.0, outlier_fraction))
    if contradictory:
        score -= 0.25
    return max(0.0, min(1.0, score))


def confidence_level_from_score(score: float) -> ConfidenceLevel:
    if score >= 0.75:
        return ConfidenceLevel.HIGH
    if score >= 0.45:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.LOW
