"""Cross-domain aggregation and conflict detection."""

from __future__ import annotations

from .config import Settings, get_settings
from .enums import AgentStatus, OverallStatus, Severity
from .models import (
    AgentAssessment,
    ConflictItem,
    CrossDomainRelationship,
    DigitalTwinObservation,
    Finding,
)
from .tools import adjust_confidence

_SEVERITY_ORDER = {
    Severity.CRITICAL: 3,
    Severity.WARNING: 2,
    Severity.INFO: 1,
}


def sort_findings(findings: list[Finding]) -> list[Finding]:
    return sorted(findings, key=lambda f: (-_SEVERITY_ORDER[f.severity], f.code))


def assess_thermal_b0_consistency(
    observation: DigitalTwinObservation,
    assessments: list[AgentAssessment],
    *,
    settings: Settings | None = None,
) -> tuple[list[CrossDomainRelationship], list[ConflictItem], list[Finding]]:
    """Compare thermal and magnet findings using a research coupling placeholder."""
    settings = settings or get_settings()
    relationships: list[CrossDomainRelationship] = []
    conflicts: list[ConflictItem] = []
    findings: list[Finding] = []

    thermal = next(
        (a for a in assessments if a.agent_name.value == "thermal_agent"), None
    )
    magnet = next(
        (a for a in assessments if a.agent_name.value == "magnet_agent"), None
    )
    if not thermal or not magnet:
        return relationships, conflicts, findings
    if thermal.status in {AgentStatus.SKIPPED, AgentStatus.ERROR}:
        return relationships, conflicts, findings
    if magnet.status in {AgentStatus.SKIPPED, AgentStatus.ERROR}:
        return relationships, conflicts, findings

    # Estimate delta T from history if possible
    delta_t = None
    if (
        observation.thermal
        and observation.thermal.history_c
        and len(observation.thermal.history_c) >= 2
    ):
        delta_t = observation.thermal.history_c[-1] - observation.thermal.history_c[0]
    elif observation.thermal and observation.thermal.magnet_temperature_c is not None:
        delta_t = 0.0  # insufficient delta info

    delta_f = None
    if (
        observation.magnet
        and observation.magnet.frequency_history_hz
        and len(observation.magnet.frequency_history_hz) >= 2
    ):
        delta_f = (
            observation.magnet.frequency_history_hz[-1]
            - observation.magnet.frequency_history_hz[0]
        )
    elif observation.magnet and observation.magnet.estimated_b0_drift_hz is not None:
        delta_f = observation.magnet.estimated_b0_drift_hz

    if delta_t is None or delta_f is None:
        relationships.append(
            CrossDomainRelationship(
                domains=["thermal", "magnet"],
                summary="Insufficient paired thermal/B0 deltas for consistency check",
                consistent=None,
                confidence=0.3,
            )
        )
        return relationships, conflicts, findings

    expected = delta_t * settings.thermal_b0_coupling_hz_per_c
    residual = abs(delta_f - expected)
    consistent = residual <= settings.thermal_b0_consistency_tol_hz
    relationships.append(
        CrossDomainRelationship(
            domains=["thermal", "magnet"],
            summary=(
                f"Thermal ΔT={delta_t:.3f}°C, observed Δf={delta_f:.3f} Hz, "
                f"expected≈{expected:.3f} Hz using research coupling "
                f"{settings.thermal_b0_coupling_hz_per_c} Hz/°C"
            ),
            consistent=consistent,
            confidence=adjust_confidence(0.55, contradictory=not consistent),
        )
    )
    if consistent:
        findings.append(
            Finding(
                code="THERMAL_B0_COUPLED",
                summary="Observed B0 change is consistent with thermal change under research coupling",
                severity=Severity.WARNING if abs(delta_f) > 0 else Severity.INFO,
                confidence=0.55,
                evidence_ids=[],
                domain="cross_domain",
            )
        )
    else:
        conflicts.append(
            ConflictItem(
                summary=(
                    f"Thermal/B0 relationship inconsistent (residual {residual:.2f} Hz "
                    f"> tol {settings.thermal_b0_consistency_tol_hz} Hz)"
                ),
                agents=["thermal_agent", "magnet_agent"],
                severity=Severity.WARNING,
            )
        )
        findings.append(
            Finding(
                code="THERMAL_B0_INCONSISTENT",
                summary="Thermal and B0 observations disagree under research coupling assumptions",
                severity=Severity.WARNING,
                confidence=0.5,
                evidence_ids=[],
                domain="cross_domain",
            )
        )
    return relationships, conflicts, findings


def derive_overall_status(
    findings: list[Finding],
    *,
    human_review: list[str],
    had_errors: bool,
    data_quality_warnings: list[str],
) -> OverallStatus:
    if had_errors and not findings:
        return OverallStatus.ERROR
    if human_review or any(f.code.endswith("INCONSISTENT") for f in findings):
        if any(f.severity == Severity.CRITICAL for f in findings):
            return OverallStatus.HUMAN_REVIEW
        if human_review:
            return OverallStatus.HUMAN_REVIEW
    if any(f.severity == Severity.CRITICAL for f in findings):
        return OverallStatus.ABNORMAL
    if any(f.severity == Severity.WARNING for f in findings) or data_quality_warnings:
        return (
            OverallStatus.ABNORMAL
            if any(f.severity == Severity.WARNING for f in findings)
            else OverallStatus.DEGRADED
        )
    if had_errors:
        return OverallStatus.DEGRADED
    return OverallStatus.NORMAL
