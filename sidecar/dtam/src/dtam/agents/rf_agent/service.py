"""RF domain service — deterministic matching analysis."""

from __future__ import annotations

from ..core.config import Settings, get_settings
from ..core.enums import ActionType, AgentName, AgentStatus, Severity
from ..core.models import (
    AgentAssessment,
    DigitalTwinObservation,
    EvidenceItem,
    Finding,
    ProposedAction,
    utc_now,
)
from ..core.tools import (
    adjust_confidence,
    confidence_level_from_score,
    reflection_from_powers,
    return_loss_db,
    vswr_from_gamma,
)


def analyze_rf(
    observation: DigitalTwinObservation,
    *,
    settings: Settings | None = None,
    activation_reason: str = "RF data present",
) -> AgentAssessment:
    started = utc_now()
    settings = settings or get_settings()
    rf = observation.rf
    if rf is None:
        ended = utc_now()
        return AgentAssessment(
            agent_name=AgentName.RF,
            activation_reason=activation_reason,
            status=AgentStatus.SKIPPED,
            summary="No RF observation provided",
            confidence=0.0,
            missing_data=["rf"],
            started_at=started,
            ended_at=ended,
            duration_ms=(ended - started).total_seconds() * 1000.0,
        )

    evidence: list[EvidenceItem] = []
    findings: list[Finding] = []
    actions: list[ProposedAction] = []
    missing: list[str] = []
    warnings: list[str] = []
    assumptions: list[str] = [
        "RF assessment is performance-oriented research analysis, not scanner safety certification"
    ]

    gamma = rf.reflection_coefficient
    rl = rf.return_loss_db

    if rf.forward_power_w is not None and rf.reflected_power_w is not None:
        try:
            refl = reflection_from_powers(rf.forward_power_w, rf.reflected_power_w)
            gamma = float(refl["reflection_coefficient"])
            evidence.append(
                EvidenceItem(
                    source="rf.reflection_from_powers",
                    description="Reflection coefficient from forward/reflected power (W)",
                    value=refl,
                    kind="calculation",
                )
            )
        except ValueError as exc:
            warnings.append(f"Power-based reflection calc failed: {exc}")
    else:
        if rf.forward_power_w is None:
            missing.append("forward_power_w")
        if rf.reflected_power_w is None:
            missing.append("reflected_power_w")

    if gamma is not None:
        try:
            rl_calc = return_loss_db(gamma)
            rl = (
                float(rl_calc["return_loss_db"])
                if rl_calc["return_loss_db"] != float("inf")
                else rl
            )
            evidence.append(
                EvidenceItem(
                    source="rf.return_loss",
                    description="Return loss from reflection coefficient",
                    value=rl_calc,
                    unit="dB",
                    kind="calculation",
                )
            )
            vswr = vswr_from_gamma(gamma)
            evidence.append(
                EvidenceItem(
                    source="rf.vswr",
                    description="VSWR from reflection coefficient",
                    value=vswr,
                    kind="calculation",
                )
            )
            vswr_val = vswr["vswr"]
            if isinstance(vswr_val, float) and vswr_val >= settings.rf_vswr_warning:
                findings.append(
                    Finding(
                        code="RF_MISMATCH_SUSPECTED",
                        summary=f"Elevated VSWR {vswr_val:.2f} suggests possible mismatch/detuning",
                        severity=Severity.WARNING,
                        confidence=adjust_confidence(0.7, missing_fields=len(missing)),
                        evidence_ids=["rf.vswr"],
                        domain="rf",
                    )
                )
        except ValueError as exc:
            warnings.append(f"RF conversion failed: {exc}")
    elif rl is None:
        missing.append("reflection_coefficient_or_return_loss")

    if rl is not None and rl < settings.rf_return_loss_warning_db:
        findings.append(
            Finding(
                code="RF_LOW_RETURN_LOSS",
                summary=f"Return loss {rl:.2f} dB below research warning threshold",
                severity=Severity.WARNING,
                confidence=0.68,
                evidence_ids=["rf.return_loss"]
                if any(e.source == "rf.return_loss" for e in evidence)
                else [],
                domain="rf",
            )
        )

    if rf.coil_state and rf.coil_state.lower() in {"fault", "disconnected", "error"}:
        findings.append(
            Finding(
                code="RF_COIL_STATE_FAULT",
                summary=f"Coil state reported as '{rf.coil_state}'",
                severity=Severity.CRITICAL,
                confidence=0.8,
                evidence_ids=[],
                domain="rf",
            )
        )
        evidence.append(
            EvidenceItem(
                source="rf.coil_state",
                description="Reported coil state",
                value=rf.coil_state,
                kind="measurement",
            )
        )

    if not findings:
        findings.append(
            Finding(
                code="RF_NO_CLEAR_ANOMALY",
                summary="No clear RF mismatch against research thresholds",
                severity=Severity.INFO,
                confidence=0.55,
                evidence_ids=[e.source for e in evidence[:1]],
                domain="rf",
            )
        )

    if observation.operating_mode.value != "observe" and any(
        f.severity != Severity.INFO for f in findings
    ):
        actions.append(
            ProposedAction(
                action_type=ActionType.INSPECT_RF_PATH,
                description="Inspect RF path and connections; do not auto-tune hardware",
                confidence=adjust_confidence(0.65, missing_fields=len(missing)),
                evidence_ids=[e.source for e in evidence[:2]],
                simulation_only=True,
            )
        )
        actions.append(
            ProposedAction(
                action_type=ActionType.REVIEW_COIL_CONNECTION,
                description="Review coil connection/state with operator",
                confidence=0.6,
                evidence_ids=["rf.coil_state"]
                if rf.coil_state
                else [e.source for e in evidence[:1]],
                simulation_only=True,
                requires_human_review=True,
            )
        )

    conf = adjust_confidence(0.7 if evidence else 0.25, missing_fields=len(missing))
    ended = utc_now()
    return AgentAssessment(
        agent_name=AgentName.RF,
        activation_reason=activation_reason,
        status=AgentStatus.OK if evidence or findings else AgentStatus.DEGRADED,
        summary=f"RF analysis complete with {len(findings)} finding(s)",
        findings=findings,
        evidence=evidence,
        proposed_actions=actions,
        confidence=conf,
        confidence_level=confidence_level_from_score(conf),
        assumptions=assumptions,
        missing_data=missing,
        warnings=warnings,
        started_at=started,
        ended_at=ended,
        duration_ms=(ended - started).total_seconds() * 1000.0,
    )
