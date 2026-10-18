"""Thermal domain service — deterministic analysis."""

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
    detect_outliers_mad,
    predict_linear_temperature,
    robust_mean_median,
    temperature_rate_of_change,
)


def analyze_thermal(
    observation: DigitalTwinObservation,
    *,
    settings: Settings | None = None,
    activation_reason: str = "temperature data present",
) -> AgentAssessment:
    started = utc_now()
    settings = settings or get_settings()
    thermal = observation.thermal
    if thermal is None:
        ended = utc_now()
        return AgentAssessment(
            agent_name=AgentName.THERMAL,
            activation_reason=activation_reason,
            status=AgentStatus.SKIPPED,
            summary="No thermal observation provided",
            confidence=0.0,
            missing_data=["thermal"],
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

    values: list[float] = []
    if thermal.sensors:
        values = [
            s.value for s in thermal.sensors if s.unit in {"C", "c", "°C", "degC"}
        ]
        bad_units = [
            s.channel for s in thermal.sensors if s.unit not in {"C", "c", "°C", "degC"}
        ]
        if bad_units:
            warnings.append(f"Ignored sensors with non-°C units: {bad_units}")
    if thermal.history_c:
        values = values if values else thermal.history_c

    if thermal.ambient_c is None:
        missing.append("ambient_c")
    if thermal.magnet_temperature_c is None:
        missing.append("magnet_temperature_c")
    if not thermal.sensors and not thermal.history_c:
        missing.append("temperature_sensors_or_history")

    conf = 0.8
    if values:
        stats = robust_mean_median(values)
        evidence.append(
            EvidenceItem(
                source="thermal.robust_stats",
                description="Robust mean/median of temperature samples",
                value=stats,
                unit="°C",
                kind="calculation",
            )
        )
        outliers = detect_outliers_mad(values, z_thresh=settings.thermal_outlier_mad_z)
        evidence.append(
            EvidenceItem(
                source="thermal.outliers_mad",
                description="MAD outlier detection on temperature samples",
                value={
                    "outlier_indices": outliers["outlier_indices"],
                    "n_outliers": len(outliers["outlier_indices"]),  # type: ignore[arg-type]
                },
                unit="°C",
                kind="calculation",
            )
        )
        n_out = len(outliers["outlier_indices"])  # type: ignore[arg-type]
        if n_out:
            findings.append(
                Finding(
                    code="THERMAL_SENSOR_OUTLIER",
                    summary=f"Detected {n_out} temperature outlier(s) via MAD",
                    severity=Severity.WARNING,
                    confidence=adjust_confidence(0.75, missing_fields=len(missing)),
                    evidence_ids=["thermal.outliers_mad"],
                    domain="thermal",
                )
            )

        ts = thermal.history_timestamps_s or None
        series = thermal.history_c if thermal.history_c else values
        try:
            rate = temperature_rate_of_change(series, ts if thermal.history_c else None)
            evidence.append(
                EvidenceItem(
                    source="thermal.rate",
                    description="Linear temperature rate-of-change baseline",
                    value=rate,
                    unit="°C/s or °C/sample",
                    kind="calculation",
                )
            )
            c_per_min = rate.get("c_per_min")
            if c_per_min == c_per_min and isinstance(
                c_per_min, (int, float)
            ):  # not NaN
                sev = Severity.INFO
                code = "THERMAL_RATE_NORMAL"
                if abs(float(c_per_min)) >= settings.thermal_rate_critical_c_per_min:
                    sev = Severity.CRITICAL
                    code = "THERMAL_RAPID_HEATING"
                elif abs(float(c_per_min)) >= settings.thermal_rate_warning_c_per_min:
                    sev = Severity.WARNING
                    code = "THERMAL_ELEVATED_RATE"
                findings.append(
                    Finding(
                        code=code,
                        summary=f"Estimated thermal rate {float(c_per_min):.4f} °C/min (baseline)",
                        severity=sev,
                        confidence=adjust_confidence(0.7, missing_fields=len(missing)),
                        evidence_ids=["thermal.rate"],
                        domain="thermal",
                    )
                )
            else:
                assumptions.append(
                    "Rate reported per sample index because timestamps were missing"
                )
        except ValueError as exc:
            warnings.append(f"Rate estimation failed: {exc}")

        try:
            horizon_s = settings.thermal_prediction_horizon_min * 60.0
            pred = predict_linear_temperature(
                series,
                ts if thermal.history_c and thermal.history_timestamps_s else None,
                horizon_s,
            )
            evidence.append(
                EvidenceItem(
                    source="thermal.prediction",
                    description="Short-horizon linear baseline temperature prediction",
                    value=pred,
                    unit="°C",
                    kind="calculation",
                )
            )
            assumptions.append(str(pred.get("note", "baseline prediction")))
        except ValueError as exc:
            warnings.append(f"Prediction failed: {exc}")
    else:
        conf = 0.2

    if thermal.magnet_temperature_c is not None:
        evidence.append(
            EvidenceItem(
                source="thermal.magnet_temperature_c",
                description="Reported magnet temperature",
                value=thermal.magnet_temperature_c,
                unit="°C",
                kind="measurement",
            )
        )
        assumptions.append(
            "Thermal changes may influence B0 via hardware-specific coupling; "
            "no site-calibrated model is applied here"
        )

    # Recommendations only meaningful when mode is recommend (orchestrator gates approval)
    if findings and any(f.severity != Severity.INFO for f in findings):
        actions.append(
            ProposedAction(
                action_type=ActionType.MONITOR_TEMPERATURE,
                description="Increase thermal monitoring cadence and review sensor channels",
                confidence=adjust_confidence(0.7, missing_fields=len(missing)),
                evidence_ids=[e.source for e in evidence[:2]],
                simulation_only=True,
            )
        )
        if any(f.code == "THERMAL_SENSOR_OUTLIER" for f in findings):
            actions.append(
                ProposedAction(
                    action_type=ActionType.REVIEW_THERMAL_SENSORS,
                    description="Inspect outlier thermal channels for disconnection or fault",
                    confidence=adjust_confidence(0.65, missing_fields=len(missing)),
                    evidence_ids=["thermal.outliers_mad"],
                    simulation_only=True,
                )
            )
        actions.append(
            ProposedAction(
                action_type=ActionType.MONITOR_FREQUENCY,
                description="Monitor center frequency for thermally-coupled B0 drift",
                confidence=adjust_confidence(0.6, missing_fields=len(missing)),
                evidence_ids=["thermal.rate"]
                if any(e.source == "thermal.rate" for e in evidence)
                else [],
                simulation_only=True,
            )
        )

    conf = adjust_confidence(conf, missing_fields=len(missing), outlier_fraction=0.0)
    status = AgentStatus.OK if values else AgentStatus.DEGRADED
    summary = f"Thermal analysis complete with {len(findings)} finding(s); missing={missing or 'none'}"
    ended = utc_now()
    return AgentAssessment(
        agent_name=AgentName.THERMAL,
        activation_reason=activation_reason,
        status=status,
        summary=summary,
        findings=findings,
        evidence=evidence,
        proposed_actions=actions
        if observation.operating_mode.value != "observe"
        else [],
        confidence=conf,
        confidence_level=confidence_level_from_score(conf),
        assumptions=assumptions,
        missing_data=missing,
        warnings=warnings,
        started_at=started,
        ended_at=ended,
        duration_ms=(ended - started).total_seconds() * 1000.0,
    )
