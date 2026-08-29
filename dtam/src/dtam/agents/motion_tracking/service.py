"""Motion-tracking domain service — deterministic analysis."""

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
    motion_magnitude,
    threshold_compare,
)


def analyze_motion(
    observation: DigitalTwinObservation,
    *,
    settings: Settings | None = None,
    activation_reason: str = "motion data present",
) -> AgentAssessment:
    started = utc_now()
    settings = settings or get_settings()
    motion = observation.motion
    if motion is None:
        ended = utc_now()
        return AgentAssessment(
            agent_name=AgentName.MOTION,
            activation_reason=activation_reason,
            status=AgentStatus.SKIPPED,
            summary="No motion observation provided",
            confidence=0.0,
            missing_data=["motion"],
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
        "Motion analysis does not infer patient clinical condition",
        f"Subject type treated as '{motion.subject_type}'",
    ]

    if motion.translation_mm is None and not motion.displacement_history_mm:
        missing.append("translation_mm_or_displacement_history")
    if motion.tracking_quality is None:
        missing.append("tracking_quality")

    mag = None
    if motion.translation_mm:
        try:
            mag_res = motion_magnitude(motion.translation_mm)
            mag = float(mag_res["magnitude_mm"])
            evidence.append(
                EvidenceItem(
                    source="motion.translation_magnitude",
                    description="Euclidean translation magnitude",
                    value=mag_res,
                    unit="mm",
                    kind="calculation",
                )
            )
            cmp_ = threshold_compare(
                mag,
                warning=settings.motion_translation_warning_mm,
                critical=settings.motion_translation_critical_mm,
                unit="mm",
            )
            evidence.append(
                EvidenceItem(
                    source="motion.translation_threshold",
                    description="Translation threshold comparison",
                    value=cmp_,
                    unit="mm",
                    kind="calculation",
                )
            )
            level = cmp_["level"]
            if level == "critical":
                findings.append(
                    Finding(
                        code="MOTION_EXCESSIVE_TRANSLATION",
                        summary=f"Translation magnitude {mag:.2f} mm exceeds critical threshold",
                        severity=Severity.CRITICAL,
                        confidence=0.8,
                        evidence_ids=["motion.translation_threshold"],
                        domain="motion",
                    )
                )
            elif level == "warning":
                findings.append(
                    Finding(
                        code="MOTION_ELEVATED_TRANSLATION",
                        summary=f"Translation magnitude {mag:.2f} mm exceeds warning threshold",
                        severity=Severity.WARNING,
                        confidence=0.75,
                        evidence_ids=["motion.translation_threshold"],
                        domain="motion",
                    )
                )
        except ValueError as exc:
            warnings.append(f"Translation analysis failed: {exc}")

    if motion.rotation_deg:
        rot_mag = sum(abs(v) for v in motion.rotation_deg)
        evidence.append(
            EvidenceItem(
                source="motion.rotation_l1",
                description="L1 rotation magnitude",
                value=rot_mag,
                unit="deg",
                kind="calculation",
            )
        )
        cmp_r = threshold_compare(
            rot_mag,
            warning=settings.motion_rotation_warning_deg,
            critical=settings.motion_rotation_critical_deg,
            unit="deg",
        )
        if cmp_r["level"] in {"warning", "critical"}:
            findings.append(
                Finding(
                    code="MOTION_ELEVATED_ROTATION",
                    summary=f"Rotation magnitude {rot_mag:.2f} deg ({cmp_r['level']})",
                    severity=Severity.CRITICAL
                    if cmp_r["level"] == "critical"
                    else Severity.WARNING,
                    confidence=0.7,
                    evidence_ids=["motion.rotation_l1"],
                    domain="motion",
                )
            )

    if motion.tracking_lost or (
        motion.tracking_quality is not None and motion.tracking_quality < 0.4
    ):
        findings.append(
            Finding(
                code="MOTION_TRACKING_DEGRADED",
                summary="Tracking lost or low tracking quality",
                severity=Severity.WARNING,
                confidence=0.85,
                evidence_ids=[],
                domain="motion",
            )
        )
        evidence.append(
            EvidenceItem(
                source="motion.tracking_quality",
                description="Tracking quality / lost flag",
                value={
                    "tracking_quality": motion.tracking_quality,
                    "tracking_lost": motion.tracking_lost,
                },
                kind="measurement",
            )
        )

    if not findings:
        findings.append(
            Finding(
                code="MOTION_WITHIN_THRESHOLDS",
                summary="Motion within research warning thresholds",
                severity=Severity.INFO,
                confidence=0.65,
                evidence_ids=[e.source for e in evidence[:1]],
                domain="motion",
            )
        )

    if observation.operating_mode.value != "observe" and any(
        f.severity != Severity.INFO for f in findings
    ):
        actions.append(
            ProposedAction(
                action_type=ActionType.OPERATOR_REVIEW_MOTION,
                description="Operator review of motion/tracking quality recommended",
                confidence=adjust_confidence(0.7, missing_fields=len(missing)),
                evidence_ids=[e.source for e in evidence[:2]],
                simulation_only=True,
                requires_human_review=True,
            )
        )
        if any(f.severity == Severity.CRITICAL for f in findings):
            actions.append(
                ProposedAction(
                    action_type=ActionType.CONSIDER_REACQUISITION,
                    description="Consider reacquisition after motion settles (recommendation only)",
                    confidence=0.6,
                    evidence_ids=[e.source for e in evidence[:1]],
                    simulation_only=True,
                    requires_human_review=True,
                )
            )

    conf = adjust_confidence(0.75 if evidence else 0.3, missing_fields=len(missing))
    ended = utc_now()
    return AgentAssessment(
        agent_name=AgentName.MOTION,
        activation_reason=activation_reason,
        status=AgentStatus.OK if evidence or findings else AgentStatus.DEGRADED,
        summary=f"Motion analysis complete with {len(findings)} finding(s)",
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
