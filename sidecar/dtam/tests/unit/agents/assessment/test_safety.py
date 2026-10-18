"""Safety policy tests."""

from __future__ import annotations

from dtam.agents.core.config import Settings
from dtam.agents.core.enums import (
    ActionType,
    OperatingMode,
    SafetyReasonCode,
    SafetyVerdict,
)
from dtam.agents.core.models import ProposedAction
from dtam.agents.core.policies import SafetyPolicy


def _action(**kwargs) -> ProposedAction:
    base = dict(
        action_type=ActionType.MONITOR_TEMPERATURE,
        description="monitor",
        confidence=0.8,
        evidence_ids=["e1"],
        simulation_only=True,
    )
    base.update(kwargs)
    return ProposedAction(**base)


def test_allowed_bounded_recommendation():
    d = SafetyPolicy(Settings(min_action_confidence=0.5)).evaluate(
        _action(), mode=OperatingMode.RECOMMEND
    )
    assert d.verdict == SafetyVerdict.PASS


def test_unsupported_action():
    d = SafetyPolicy().evaluate(
        _action(action_type=ActionType.EXECUTE_SCANNER_CONTROL),
        mode=OperatingMode.RECOMMEND,
    )
    assert d.verdict == SafetyVerdict.REJECT
    assert SafetyReasonCode.HARDWARE_CONTROL_FORBIDDEN in d.reason_codes


def test_missing_units_for_sim_correction():
    d = SafetyPolicy().evaluate(
        _action(
            action_type=ActionType.SIMULATE_FREQUENCY_CORRECTION,
            parameters={"delta_hz": 10.0},
            units={},
            requires_human_review=True,
        ),
        mode=OperatingMode.RECOMMEND,
    )
    assert d.verdict != SafetyVerdict.PASS
    assert SafetyReasonCode.MISSING_UNITS in d.reason_codes


def test_low_confidence():
    d = SafetyPolicy(Settings(min_action_confidence=0.9)).evaluate(
        _action(confidence=0.2), mode=OperatingMode.RECOMMEND
    )
    assert d.verdict != SafetyVerdict.PASS
    assert SafetyReasonCode.LOW_CONFIDENCE in d.reason_codes


def test_excessive_correction():
    d = SafetyPolicy(Settings(simulate_freq_correction_max_hz=50.0)).evaluate(
        _action(
            action_type=ActionType.SIMULATE_FREQUENCY_CORRECTION,
            parameters={"delta_hz": 500.0},
            units={"delta_hz": "Hz"},
            requires_human_review=True,
        ),
        mode=OperatingMode.RECOMMEND,
    )
    assert SafetyReasonCode.OUT_OF_BOUNDS in d.reason_codes


def test_hardware_forbidden():
    d = SafetyPolicy().evaluate(
        _action(action_type=ActionType.TUNE_RF_HARDWARE),
        mode=OperatingMode.RECOMMEND,
    )
    assert SafetyReasonCode.HARDWARE_CONTROL_FORBIDDEN in d.reason_codes


def test_act_mode_disabled():
    d = SafetyPolicy(Settings(enable_simulated_act_mode=False)).evaluate(
        _action(), mode=OperatingMode.ACT
    )
    assert SafetyReasonCode.ACT_MODE_DISABLED in d.reason_codes


def test_observe_rejects_actions():
    d = SafetyPolicy().evaluate(_action(), mode=OperatingMode.OBSERVE)
    assert d.verdict == SafetyVerdict.REJECT
