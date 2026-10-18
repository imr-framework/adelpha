"""EMI domain service — deterministic feature analysis."""

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
    band_power,
    confidence_level_from_score,
    dominant_frequencies,
    peak_to_peak,
    rms,
)


def analyze_emi(
    observation: DigitalTwinObservation,
    *,
    settings: Settings | None = None,
    activation_reason: str = "EMI data present",
) -> AgentAssessment:
    started = utc_now()
    settings = settings or get_settings()
    emi = observation.emi
    if emi is None:
        ended = utc_now()
        return AgentAssessment(
            agent_name=AgentName.EMI,
            activation_reason=activation_reason,
            status=AgentStatus.SKIPPED,
            summary="No EMI observation provided",
            confidence=0.0,
            missing_data=["emi"],
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
        "EMI features support observation and hypothesis only; source attribution requires more evidence"
    ]

    rms_val = emi.rms
    p2p_val = emi.peak_to_peak
    peaks = list(emi.dominant_frequencies_hz or emi.spectral_peaks_hz)

    if emi.samples:
        if len(emi.samples) > settings.max_emi_samples:
            ended = utc_now()
            return AgentAssessment(
                agent_name=AgentName.EMI,
                activation_reason=activation_reason,
                status=AgentStatus.ERROR,
                summary="EMI sample array exceeds configured size limit",
                confidence=0.0,
                warnings=[f"max_emi_samples={settings.max_emi_samples}"],
                error="emi_samples_too_large",
                started_at=started,
                ended_at=ended,
                duration_ms=(ended - started).total_seconds() * 1000.0,
            )
        try:
            rms_val = float(rms(emi.samples)["rms"])
            p2p_val = float(peak_to_peak(emi.samples)["peak_to_peak"])
            evidence.append(
                EvidenceItem(
                    source="emi.time_features",
                    description="RMS and peak-to-peak from samples",
                    value={
                        "rms": rms_val,
                        "peak_to_peak": p2p_val,
                        "n": len(emi.samples),
                    },
                    kind="calculation",
                )
            )
            if emi.sample_rate_hz:
                dom = dominant_frequencies(
                    emi.samples,
                    emi.sample_rate_hz,
                    max_samples=settings.max_emi_samples,
                )
                evidence.append(
                    EvidenceItem(
                        source="emi.fft_peaks",
                        description="FFT dominant frequencies",
                        value=dom,
                        unit="Hz",
                        kind="calculation",
                    )
                )
                peaks_raw = dom.get("peaks", [])
                fft_peaks: list[float] = []
                if isinstance(peaks_raw, list):
                    for item in peaks_raw:
                        if isinstance(item, dict) and "frequency_hz" in item:
                            fft_peaks.append(float(item["frequency_hz"]))
                if fft_peaks:
                    peaks = fft_peaks
                bands = band_power(
                    emi.samples,
                    emi.sample_rate_hz,
                    {
                        "low": (0.0, 100.0),
                        "mid": (100.0, 1000.0),
                        "high": (1000.0, min(emi.sample_rate_hz / 2.0, 10000.0)),
                    },
                    max_samples=settings.max_emi_samples,
                )
                evidence.append(
                    EvidenceItem(
                        source="emi.band_power",
                        description="Band power integrals",
                        value=bands,
                        kind="calculation",
                    )
                )
            else:
                missing.append("sample_rate_hz")
        except ValueError as exc:
            warnings.append(f"Sample feature extraction failed: {exc}")
    else:
        if rms_val is None:
            missing.append("rms_or_samples")
        if p2p_val is None:
            missing.append("peak_to_peak_or_samples")

    if rms_val is not None:
        evidence.append(
            EvidenceItem(
                source="emi.rms",
                description="EMI RMS level",
                value=rms_val,
                kind="measurement"
                if emi.rms is not None and not emi.samples
                else "calculation",
            )
        )
        if rms_val >= settings.emi_rms_warning:
            findings.append(
                Finding(
                    code="EMI_ELEVATED_RMS",
                    summary=f"Elevated EMI RMS {rms_val:.4g}",
                    severity=Severity.WARNING,
                    confidence=adjust_confidence(0.7, missing_fields=len(missing)),
                    evidence_ids=["emi.rms"],
                    domain="emi",
                )
            )

    if p2p_val is not None and p2p_val >= settings.emi_peak_warning:
        findings.append(
            Finding(
                code="EMI_ELEVATED_PEAK",
                summary=f"Elevated EMI peak-to-peak {p2p_val:.4g}",
                severity=Severity.WARNING,
                confidence=0.65,
                evidence_ids=["emi.time_features"] if emi.samples else ["emi.rms"],
                domain="emi",
            )
        )

    if peaks:
        evidence.append(
            EvidenceItem(
                source="emi.dominant_frequencies_hz",
                description="Dominant / spectral peak frequencies",
                value=peaks,
                unit="Hz",
                kind="calculation" if emi.samples else "measurement",
            )
        )
        if len(peaks) == 1 or (len(peaks) >= 1 and peaks[0] > 0):
            findings.append(
                Finding(
                    code="EMI_NARROWBAND_CANDIDATE",
                    summary=(
                        f"Narrowband interference candidate near {peaks[0]:.2f} Hz "
                        "(hypothesis — not a confirmed source)"
                    ),
                    severity=Severity.WARNING,
                    confidence=adjust_confidence(0.55, missing_fields=len(missing)),
                    evidence_ids=["emi.dominant_frequencies_hz"],
                    domain="emi",
                )
            )

    if not findings and (rms_val is not None or peaks):
        findings.append(
            Finding(
                code="EMI_NO_CLEAR_ANOMALY",
                summary="No clear EMI anomaly against research thresholds",
                severity=Severity.INFO,
                confidence=0.6,
                evidence_ids=[e.source for e in evidence[:1]],
                domain="emi",
            )
        )

    if observation.operating_mode.value != "observe" and any(
        f.severity != Severity.INFO for f in findings
    ):
        actions.append(
            ProposedAction(
                action_type=ActionType.REVIEW_EMI_ENVIRONMENT,
                description="Review EMI environment and acquisition timing near dominant bands",
                confidence=adjust_confidence(0.6, missing_fields=len(missing)),
                evidence_ids=[e.source for e in evidence[:2]],
                simulation_only=True,
            )
        )
        actions.append(
            ProposedAction(
                action_type=ActionType.CHECK_GROUNDING_SHIELDING,
                description="Check grounding/shielding integrity (diagnostic recommendation only)",
                confidence=0.58,
                evidence_ids=[e.source for e in evidence[:1]],
                simulation_only=True,
                requires_human_review=True,
            )
        )

    conf = adjust_confidence(0.7 if evidence else 0.2, missing_fields=len(missing))
    ended = utc_now()
    return AgentAssessment(
        agent_name=AgentName.EMI,
        activation_reason=activation_reason,
        status=AgentStatus.OK if evidence else AgentStatus.DEGRADED,
        summary=f"EMI analysis complete with {len(findings)} finding(s)",
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
