"""Graph-governed multi-agent orchestration (deterministic core).

Autonomous reasoning (LLM wrappers) may propose analyses; this module owns
routing, parallel specialist execution, aggregation, and safety gating.
"""

from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from ..emi_agent.service import analyze_emi
from ..magnet_agent.service import analyze_magnet
from ..motion_tracking.service import analyze_motion
from ..rf_agent.service import analyze_rf
from ..thermal_agent.service import analyze_thermal
from .aggregation import (
    assess_thermal_b0_consistency,
    derive_overall_status,
    sort_findings,
)
from .config import Settings, get_settings
from .enums import AgentName, AgentStatus, OperatingMode, SafetyVerdict
from .logging_utils import get_logger
from .models import (
    AgentAssessment,
    DigitalTwinAssessment,
    DigitalTwinObservation,
    ProposedAction,
    utc_now,
)
from .policies import SafetyPolicy
from .provenance import ProvenanceRecorder
from .routing import plan_activations
from .tools import adjust_confidence

logger = get_logger("dtam.agents.orchestrator")

Analyzer = Callable[..., AgentAssessment]

ANALYZERS: dict[AgentName, Analyzer] = {
    AgentName.THERMAL: analyze_thermal,
    AgentName.MAGNET: analyze_magnet,
    AgentName.EMI: analyze_emi,
    AgentName.RF: analyze_rf,
    AgentName.MOTION: analyze_motion,
}


def _run_one(
    agent: AgentName,
    reason: str,
    observation: DigitalTwinObservation,
    settings: Settings,
) -> AgentAssessment:
    analyzer = ANALYZERS[agent]
    try:
        return analyzer(observation, settings=settings, activation_reason=reason)
    except Exception as exc:  # noqa: BLE001 — isolate specialist failures
        ended = utc_now()
        logger.exception("specialist_failed agent=%s", agent.value)
        return AgentAssessment(
            agent_name=agent,
            activation_reason=reason,
            status=AgentStatus.ERROR,
            summary=f"Specialist failed: {type(exc).__name__}",
            confidence=0.0,
            error=str(exc),
            ended_at=ended,
            duration_ms=0.0,
        )


def run_assessment(
    observation: DigitalTwinObservation,
    *,
    mode: OperatingMode | None = None,
    settings: Settings | None = None,
) -> DigitalTwinAssessment:
    """Execute conditional routing → parallel specialists → aggregate → safety."""
    settings = settings or get_settings()
    prov = ProvenanceRecorder()
    started = utc_now()

    # Mode override from CLI / caller without mutating caller's expectations silently
    if mode is not None:
        observation = observation.model_copy(update={"operating_mode": mode})

    if (
        observation.operating_mode == OperatingMode.ACT
        and not settings.enable_simulated_act_mode
    ):
        prov.record("safety", "act_mode_disabled", enabled=False)

    correlation_id = observation.correlation_id or "unknown"
    prov.record(
        "orchestrator",
        "run_start",
        correlation_id=correlation_id,
        mode=observation.operating_mode.value,
    )
    logger.info(
        "run_start correlation_id=%s mode=%s",
        correlation_id,
        observation.operating_mode.value,
    )

    plan = plan_activations(observation)
    prov.record(
        "orchestrator",
        "routing",
        activated=[a.agent.value for a in plan.activate],
        skipped=plan.skipped,
    )

    assessments: list[AgentAssessment] = []
    if plan.activate:
        workers = min(settings.max_parallel_workers, len(plan.activate))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(_run_one, d.agent, d.reason, observation, settings): d
                for d in plan.activate
            }
            for fut in as_completed(futures):
                result = fut.result()
                assessments.append(result)
                prov.record(
                    result.agent_name.value,
                    "assessment_complete",
                    status=result.status.value,
                    findings=len(result.findings),
                    duration_ms=result.duration_ms,
                    error=result.error,
                )

    # Deterministic order in output
    order = [
        AgentName.THERMAL,
        AgentName.MAGNET,
        AgentName.EMI,
        AgentName.RF,
        AgentName.MOTION,
    ]
    assessments.sort(
        key=lambda a: order.index(a.agent_name) if a.agent_name in order else 99
    )

    relationships, conflicts, cross_findings = assess_thermal_b0_consistency(
        observation, assessments, settings=settings
    )
    if relationships or conflicts:
        prov.record(
            "orchestrator",
            "cross_domain",
            relationships=len(relationships),
            conflicts=len(conflicts),
        )

    findings = []
    for a in assessments:
        findings.extend(a.findings)
    findings.extend(cross_findings)
    findings = sort_findings(findings)

    data_quality_warnings: list[str] = []
    for a in assessments:
        data_quality_warnings.extend(a.warnings)
        for m in a.missing_data:
            data_quality_warnings.append(f"{a.agent_name.value}: missing {m}")

    proposed: list[ProposedAction] = []
    for a in assessments:
        proposed.extend(a.proposed_actions)

    # Safety is mandatory whenever actions exist.
    safety = SafetyPolicy(settings)
    safety_decisions = safety.evaluate_many(proposed, mode=observation.operating_mode)
    prov.record("safety", "evaluated", n=len(safety_decisions))

    approved = [d.action for d in safety_decisions if d.verdict == SafetyVerdict.PASS]
    rejected = [d.action for d in safety_decisions if d.verdict == SafetyVerdict.REJECT]
    human_review = [
        f"{d.action.action_type.value}: {d.explanation}"
        for d in safety_decisions
        if d.verdict == SafetyVerdict.HUMAN_REVIEW_REQUIRED
    ]
    for c in conflicts:
        human_review.append(c.summary)

    had_errors = any(a.status == AgentStatus.ERROR for a in assessments)
    overall = derive_overall_status(
        findings,
        human_review=human_review,
        had_errors=had_errors,
        data_quality_warnings=data_quality_warnings,
    )

    confidences = [
        a.confidence for a in assessments if a.status not in {AgentStatus.SKIPPED}
    ]
    overall_conf = sum(confidences) / len(confidences) if confidences else 0.0
    if conflicts:
        overall_conf = adjust_confidence(overall_conf, contradictory=True)
    overall_conf = adjust_confidence(
        overall_conf, missing_fields=len(data_quality_warnings) // 3
    )

    activated = [a.agent_name.value for a in assessments]
    state_bits = []
    if observation.scanner_state:
        state_bits.append(f"scanner={observation.scanner_state}")
    state_bits.append(f"agents={len(activated)}")
    state_bits.append(f"findings={len(findings)}")
    state_summary = "; ".join(state_bits)

    top = findings[0].summary if findings else "No significant findings"
    explanation = (
        f"Mode={observation.operating_mode.value}. Activated {len(activated)} specialist(s). "
        f"Overall={overall.value}. Top finding: {top}. "
        f"Approved recommendations: {len(approved)}; rejected: {len(rejected)}; "
        f"human-review: {len(human_review)}."
    )

    ended = utc_now()
    prov.record(
        "orchestrator",
        "run_complete",
        duration_ms=(ended - started).total_seconds() * 1000.0,
        overall_status=overall.value,
    )

    return DigitalTwinAssessment(
        correlation_id=correlation_id,
        timestamp=ended,
        operating_mode=observation.operating_mode,
        overall_status=overall,
        activated_agents=activated,
        skipped_agents=plan.skipped,
        state_summary=state_summary,
        findings=findings,
        cross_domain_relationships=relationships,
        conflicts=conflicts,
        approved_recommendations=approved,
        rejected_recommendations=rejected,
        human_review_items=human_review,
        safety_decisions=safety_decisions,
        data_quality_warnings=list(dict.fromkeys(data_quality_warnings)),
        provenance=prov.events,
        overall_confidence=overall_conf,
        explanation=explanation,
        agent_assessments=assessments,
    )


def assess_observation_json(
    payload: dict[str, Any], *, mode: str | None = None
) -> DigitalTwinAssessment:
    """Validate JSON payload and run assessment."""
    obs = DigitalTwinObservation.model_validate(payload)
    op_mode = OperatingMode(mode) if mode else None
    return run_assessment(obs, mode=op_mode)
