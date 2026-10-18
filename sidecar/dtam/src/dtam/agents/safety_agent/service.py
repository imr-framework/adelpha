"""Safety agent service — deterministic policy wrapper."""

from __future__ import annotations

from ..core.config import Settings, get_settings
from ..core.enums import (
    AgentName,
    AgentStatus,
    OperatingMode,
    SafetyReasonCode,
    SafetyVerdict,
)
from ..core.models import AgentAssessment, ProposedAction, SafetyDecision, utc_now
from ..core.policies import SafetyPolicy
from ..core.tools import confidence_level_from_score


def evaluate_actions(
    actions: list[ProposedAction],
    *,
    mode: OperatingMode,
    settings: Settings | None = None,
) -> tuple[list[SafetyDecision], AgentAssessment]:
    """Run deterministic safety validation and return an explanatory assessment."""
    started = utc_now()
    settings = settings or get_settings()
    policy = SafetyPolicy(settings)
    try:
        decisions = policy.evaluate_many(actions, mode=mode)
    except Exception as exc:  # noqa: BLE001 — fail closed
        ended = utc_now()
        fail = [
            SafetyDecision(
                action=a,
                verdict=SafetyVerdict.REJECT,
                reason_codes=[SafetyReasonCode.SAFETY_VALIDATOR_FAILURE],
                explanation=f"Safety validator failure: {type(exc).__name__}",
            )
            for a in actions
        ]
        return fail, AgentAssessment(
            agent_name=AgentName.SAFETY,
            activation_reason="proposed actions present",
            status=AgentStatus.ERROR,
            summary="Safety validator failed; all actions rejected",
            confidence=0.0,
            error=str(exc),
            started_at=started,
            ended_at=ended,
            duration_ms=(ended - started).total_seconds() * 1000.0,
        )

    passed = sum(1 for d in decisions if d.verdict == SafetyVerdict.PASS)
    rejected = sum(1 for d in decisions if d.verdict == SafetyVerdict.REJECT)
    review = sum(
        1 for d in decisions if d.verdict == SafetyVerdict.HUMAN_REVIEW_REQUIRED
    )
    ended = utc_now()
    assessment = AgentAssessment(
        agent_name=AgentName.SAFETY,
        activation_reason="proposed actions present",
        status=AgentStatus.OK,
        summary=(
            f"Safety evaluated {len(decisions)} action(s): "
            f"pass={passed}, reject={rejected}, review={review}"
        ),
        confidence=1.0,
        confidence_level=confidence_level_from_score(1.0),
        assumptions=["Final authorization is deterministic policy, not LLM judgment"],
        started_at=started,
        ended_at=ended,
        duration_ms=(ended - started).total_seconds() * 1000.0,
    )
    return decisions, assessment
