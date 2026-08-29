"""Magnet / B0 domain service — deterministic analysis."""

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
    drift_rate_hz_per_s,
    field_to_frequency_hz,
)


def analyze_magnet(
    observation: DigitalTwinObservation,
    *,
    settings: Settings | None = None,
    activation_reason: str = "center-frequency or B0 data present",
) -> AgentAssessment:
    started = utc_now()
    settings = settings or get_settings()
    magnet = observation.magnet
    if magnet is None:
        ended = utc_now()
        return AgentAssessment(
            agent_name=AgentName.MAGNET,
            activation_reason=activation_reason,
            status=AgentStatus.SKIPPED,
            summary="No magnet observation provided",
            confidence=0.0,
            missing_data=["magnet"],
            started_at=started,
            ended_at=ended,
            duration_ms=(ended - started).total_seconds() * 1000.0,
        )

    evidence: list[EvidenceItem] = []
    findings: list[Finding] = []
    actions: list[ProposedAction] = []
    missing: list[str] = []
    warnings: list[str] = []
    assumptions: list[str] = []

    if magnet.center_frequency_hz is None and not magnet.frequency_history_hz:
        missing.append("center_frequency_hz_or_history")
    if magnet.estimated_b0_drift_hz is None and not magnet.frequency_history_hz:
        missing.append("estimated_b0_drift_hz")

    conf = 0.75
    if magnet.center_frequency_hz is not None:
        evidence.append(
            EvidenceItem(
                source="magnet.center_frequency_hz",
                description="Reported center frequency",
                value=magnet.center_frequency_hz,
                unit="Hz",
                kind="measurement",
            )
        )

    if magnet.nominal_field_t is not None:
        try:
            conv = field_to_frequency_hz(magnet.nominal_field_t, magnet.nucleus)
            evidence.append(
                EvidenceItem(
                    source="magnet.nominal_larmor",
                    description="Nominal Larmor frequency from field (tabulated gamma)",
                    value=conv,
                    unit="Hz",
                    kind="calculation",
                )
            )
            assumptions.append(str(conv.get("note", "")))
            if magnet.center_frequency_hz is not None:
                delta = magnet.center_frequency_hz - float(conv["frequency_hz"])
                evidence.append(
                    EvidenceItem(
                        source="magnet.freq_vs_nominal",
                        description="Offset from nominal Larmor frequency",
                        value=delta,
                        unit="Hz",
                        kind="calculation",
                    )
                )
        except ValueError as exc:
            warnings.append(f"Field/frequency conversion skipped: {exc}")

    hz_per_min = None
    if magnet.frequency_history_hz:
        try:
            drift = drift_rate_hz_per_s(
                magnet.frequency_history_hz,
                magnet.frequency_timestamps_s or None,
            )
            evidence.append(
                EvidenceItem(
                    source="magnet.drift_rate",
                    description="Linear frequency drift-rate baseline",
                    value=drift,
                    unit="Hz/s",
                    kind="calculation",
                )
            )
            hz_per_min = drift.get("hz_per_min")
            if isinstance(hz_per_min, (int, float)):
                sev = Severity.INFO
                code = "B0_DRIFT_NORMAL"
                if abs(float(hz_per_min)) >= settings.magnet_drift_critical_hz_per_min:
                    sev = Severity.CRITICAL
                    code = "B0_DRIFT_CRITICAL"
                elif abs(float(hz_per_min)) >= settings.magnet_drift_warning_hz_per_min:
                    sev = Severity.WARNING
                    code = "B0_DRIFT_ELEVATED"
                findings.append(
                    Finding(
                        code=code,
                        summary=f"Estimated B0 drift rate {float(hz_per_min):.3f} Hz/min",
                        severity=sev,
                        confidence=adjust_confidence(0.72, missing_fields=len(missing)),
                        evidence_ids=["magnet.drift_rate"],
                        domain="magnet",
                    )
                )
            # Abrupt change check
            hist = magnet.frequency_history_hz
            if len(hist) >= 2:
                delta = hist[-1] - hist[-2]
                if abs(delta) >= settings.magnet_abrupt_delta_hz:
                    findings.append(
                        Finding(
                            code="B0_ABRUPT_CHANGE",
                            summary=f"Abrupt frequency step {delta:.2f} Hz between last samples",
                            severity=Severity.WARNING,
                            confidence=0.7,
                            evidence_ids=["magnet.drift_rate"],
                            domain="magnet",
                        )
                    )
        except ValueError as exc:
            warnings.append(f"Drift estimation failed: {exc}")
            conf = 0.4
    elif magnet.estimated_b0_drift_hz is not None:
        evidence.append(
            EvidenceItem(
                source="magnet.estimated_b0_drift_hz",
                description="Provided B0 drift estimate",
                value=magnet.estimated_b0_drift_hz,
                unit="Hz",
                kind="measurement",
            )
        )
        findings.append(
            Finding(
                code="B0_DRIFT_REPORTED",
                summary=f"Reported B0 drift estimate {magnet.estimated_b0_drift_hz:.3f} Hz",
                severity=Severity.WARNING
                if abs(magnet.estimated_b0_drift_hz) >= settings.magnet_abrupt_delta_hz
                else Severity.INFO,
                confidence=0.55,
                evidence_ids=["magnet.estimated_b0_drift_hz"],
                domain="magnet",
            )
        )
    else:
        conf = 0.25

    # Thermal consistency note (detailed cross-domain done in orchestrator)
    if observation.thermal and observation.thermal.magnet_temperature_c is not None:
        assumptions.append(
            "Cross-check thermal/B0 consistency in orchestrator using research coupling constant"
        )

    if (
        observation.operating_mode.value != "observe"
        and findings
        and any(f.severity != Severity.INFO for f in findings)
    ):
        actions.append(
            ProposedAction(
                action_type=ActionType.MONITOR_FREQUENCY,
                description=(
                    "Continue center-frequency monitoring; "
                    "do not apply corrections automatically"
                ),
                confidence=adjust_confidence(0.7, missing_fields=len(missing)),
                evidence_ids=[e.source for e in evidence[:2]],
                simulation_only=True,
            )
        )
        # Bounded simulation-only recommendation
        delta = 0.0
        if magnet.frequency_history_hz and len(magnet.frequency_history_hz) >= 2:
            delta = magnet.frequency_history_hz[0] - magnet.frequency_history_hz[-1]
        elif magnet.estimated_b0_drift_hz is not None:
            delta = -magnet.estimated_b0_drift_hz
        if abs(delta) > 0:
            actions.append(
                ProposedAction(
                    action_type=ActionType.SIMULATE_FREQUENCY_CORRECTION,
                    description="Simulate a bounded frequency correction (stub only)",
                    confidence=adjust_confidence(0.6, missing_fields=len(missing)),
                    parameters={"delta_hz": float(delta)},
                    units={"delta_hz": "Hz"},
                    evidence_ids=[e.source for e in evidence[:1]],
                    simulation_only=True,
                    requires_human_review=True,
                )
            )

    conf = adjust_confidence(conf, missing_fields=len(missing))
    ended = utc_now()
    return AgentAssessment(
        agent_name=AgentName.MAGNET,
        activation_reason=activation_reason,
        status=AgentStatus.OK if evidence else AgentStatus.DEGRADED,
        summary=f"Magnet/B0 analysis complete with {len(findings)} finding(s)",
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
