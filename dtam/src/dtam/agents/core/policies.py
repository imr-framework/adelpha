"""Deterministic safety policy for proposed actions.

The final authorization decision comes from this module, not from an LLM.
"""

from __future__ import annotations

from collections.abc import Iterable

from .config import Settings, get_settings
from .enums import ActionType, OperatingMode, SafetyReasonCode, SafetyVerdict
from .models import ProposedAction, SafetyDecision

# Actions that may be approved in recommend mode when bounds/confidence pass.
ALLOWED_RECOMMENDATIONS: frozenset[ActionType] = frozenset(
    {
        ActionType.MONITOR_FREQUENCY,
        ActionType.MONITOR_TEMPERATURE,
        ActionType.REVIEW_THERMAL_SENSORS,
        ActionType.REVIEW_EMI_ENVIRONMENT,
        ActionType.CHECK_GROUNDING_SHIELDING,
        ActionType.INSPECT_RF_PATH,
        ActionType.REVIEW_COIL_CONNECTION,
        ActionType.OPERATOR_REVIEW_MOTION,
        ActionType.CONSIDER_REACQUISITION,
        ActionType.HUMAN_REVIEW,
        ActionType.SIMULATE_FREQUENCY_CORRECTION,
    }
)

HARDWARE_FORBIDDEN: frozenset[ActionType] = frozenset(
    {
        ActionType.APPLY_FREQUENCY_CORRECTION,
        ActionType.TUNE_RF_HARDWARE,
        ActionType.EXECUTE_SCANNER_CONTROL,
    }
)

# Parameters that require explicit units when present.
UNIT_REQUIRED_PARAMS: dict[ActionType, tuple[str, ...]] = {
    ActionType.SIMULATE_FREQUENCY_CORRECTION: ("delta_hz",),
}


class SafetyPolicy:
    """Allowlist + bounds + confidence gate. Failure-safe: unknown → reject."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    def evaluate(
        self,
        action: ProposedAction,
        *,
        mode: OperatingMode,
    ) -> SafetyDecision:
        try:
            return self._evaluate(action, mode=mode)
        except Exception as exc:  # noqa: BLE001 — fail closed
            return SafetyDecision(
                action=action,
                verdict=SafetyVerdict.REJECT,
                reason_codes=[SafetyReasonCode.SAFETY_VALIDATOR_FAILURE],
                explanation=f"Safety validator failure; rejecting action. ({type(exc).__name__})",
            )

    def evaluate_many(
        self,
        actions: Iterable[ProposedAction],
        *,
        mode: OperatingMode,
    ) -> list[SafetyDecision]:
        return [self.evaluate(a, mode=mode) for a in actions]

    def _evaluate(
        self, action: ProposedAction, *, mode: OperatingMode
    ) -> SafetyDecision:
        reasons: list[SafetyReasonCode] = []

        if mode == OperatingMode.ACT and not self.settings.enable_simulated_act_mode:
            return SafetyDecision(
                action=action,
                verdict=SafetyVerdict.REJECT,
                reason_codes=[SafetyReasonCode.ACT_MODE_DISABLED],
                explanation="act mode is disabled unless DT_ENABLE_SIMULATED_ACT_MODE is set",
            )

        if mode == OperatingMode.OBSERVE:
            return SafetyDecision(
                action=action,
                verdict=SafetyVerdict.REJECT,
                reason_codes=[SafetyReasonCode.INVALID_MODE],
                explanation="observe mode analyzes state only; recommendations are not approved",
            )

        if action.action_type in HARDWARE_FORBIDDEN:
            return SafetyDecision(
                action=action,
                verdict=SafetyVerdict.REJECT,
                reason_codes=[SafetyReasonCode.HARDWARE_CONTROL_FORBIDDEN],
                explanation="Real scanner/hardware control actions are forbidden",
            )

        if action.action_type not in ALLOWED_RECOMMENDATIONS:
            return SafetyDecision(
                action=action,
                verdict=SafetyVerdict.REJECT,
                reason_codes=[SafetyReasonCode.UNSUPPORTED_ACTION],
                explanation=f"Action type {action.action_type.value} is not on the allowlist",
            )

        if action.confidence < self.settings.min_action_confidence:
            reasons.append(SafetyReasonCode.LOW_CONFIDENCE)

        if not action.evidence_ids:
            reasons.append(SafetyReasonCode.MISSING_EVIDENCE)

        required_params = UNIT_REQUIRED_PARAMS.get(action.action_type, ())
        for param in required_params:
            if param not in action.parameters:
                reasons.append(SafetyReasonCode.INSUFFICIENT_SUPPORT)
            elif param not in action.units:
                reasons.append(SafetyReasonCode.MISSING_UNITS)

        if action.action_type == ActionType.SIMULATE_FREQUENCY_CORRECTION:
            delta = action.parameters.get("delta_hz")
            if delta is None:
                reasons.append(SafetyReasonCode.INSUFFICIENT_SUPPORT)
            else:
                try:
                    delta_f = float(delta)
                except (TypeError, ValueError):
                    reasons.append(SafetyReasonCode.INSUFFICIENT_SUPPORT)
                else:
                    if abs(delta_f) > self.settings.simulate_freq_correction_max_hz:
                        reasons.append(SafetyReasonCode.OUT_OF_BOUNDS)
                    if action.units.get("delta_hz") != "Hz":
                        reasons.append(SafetyReasonCode.MISSING_UNITS)

        # Simulation flag must remain true for any near-control recommendation.
        if (
            action.action_type == ActionType.SIMULATE_FREQUENCY_CORRECTION
            and not action.simulation_only
        ):
            reasons.append(SafetyReasonCode.HARDWARE_CONTROL_FORBIDDEN)

        if reasons:
            verdict = (
                SafetyVerdict.HUMAN_REVIEW_REQUIRED
                if action.requires_human_review
                or SafetyReasonCode.LOW_CONFIDENCE in reasons
                else SafetyVerdict.REJECT
            )
            if SafetyReasonCode.HARDWARE_CONTROL_FORBIDDEN in reasons:
                verdict = SafetyVerdict.REJECT
            return SafetyDecision(
                action=action,
                verdict=verdict,
                reason_codes=list(dict.fromkeys(reasons)),
                explanation="Action failed deterministic safety checks",
            )

        if action.requires_human_review:
            return SafetyDecision(
                action=action,
                verdict=SafetyVerdict.HUMAN_REVIEW_REQUIRED,
                reason_codes=[SafetyReasonCode.ALLOWED],
                explanation="Action is allowlisted but marked for human review",
            )

        return SafetyDecision(
            action=action,
            verdict=SafetyVerdict.PASS,
            reason_codes=[SafetyReasonCode.ALLOWED],
            explanation="Action passed allowlist, confidence, evidence, and bounds checks",
        )


def validate_actions(
    actions: list[ProposedAction],
    *,
    mode: OperatingMode,
    settings: Settings | None = None,
) -> list[SafetyDecision]:
    return SafetyPolicy(settings).evaluate_many(actions, mode=mode)
