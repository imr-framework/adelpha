"""Integration tests for deterministic orchestrator (no live API)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from dtam.agents.core.enums import AgentName, AgentStatus, OperatingMode, OverallStatus
from dtam.agents.core.models import DigitalTwinObservation
from dtam.agents.core.orchestrator import run_assessment

EXAMPLES = Path(__file__).resolve().parents[4] / "src" / "dtam" / "agents" / "examples"


def _load(name: str) -> DigitalTwinObservation:
    return DigitalTwinObservation.model_validate(
        json.loads((EXAMPLES / name).read_text())
    )


def test_normal_state():
    result = run_assessment(_load("normal_state.json"))
    assert result.overall_status in {
        OverallStatus.NORMAL,
        OverallStatus.DEGRADED,
        OverallStatus.ABNORMAL,
    }
    # Should not approve recommendations in observe mode
    assert result.approved_recommendations == []


def test_thermal_b0_coupled():
    result = run_assessment(
        _load("thermal_b0_coupled_drift.json"), mode=OperatingMode.RECOMMEND
    )
    assert "thermal_agent" in result.activated_agents
    assert "magnet_agent" in result.activated_agents
    assert result.cross_domain_relationships
    assert any(
        r.domains == ["thermal", "magnet"] for r in result.cross_domain_relationships
    )


def test_multi_fault():
    result = run_assessment(
        _load("multi_fault_state.json"), mode=OperatingMode.RECOMMEND
    )
    assert len(result.activated_agents) >= 4
    assert result.safety_decisions
    # All proposed actions must have been safety-checked
    n_actions = sum(len(a.proposed_actions) for a in result.agent_assessments)
    assert len(result.safety_decisions) == n_actions


def test_failed_specialist_partial_results():
    def boom(*args, **kwargs):
        raise RuntimeError("simulated failure")

    obs = _load("multi_fault_state.json")
    with patch.dict(
        "dtam.agents.core.orchestrator.ANALYZERS",
        {AgentName.EMI: boom},
        clear=False,
    ):
        # Need to patch the mapping entry
        from dtam.agents.core import orchestrator as orch

        original = orch.ANALYZERS[AgentName.EMI]
        orch.ANALYZERS[AgentName.EMI] = boom
        try:
            result = run_assessment(obs, mode=OperatingMode.RECOMMEND)
        finally:
            orch.ANALYZERS[AgentName.EMI] = original

    assert any(
        a.agent_name == AgentName.EMI and a.status == AgentStatus.ERROR
        for a in result.agent_assessments
    )
    assert any(a.status == AgentStatus.OK for a in result.agent_assessments)
    assert result.overall_status != OverallStatus.ERROR or result.findings


def test_json_structure_deterministic():
    result = run_assessment(_load("rf_mismatch.json"), mode=OperatingMode.RECOMMEND)
    data = result.model_dump(mode="json")
    for key in [
        "correlation_id",
        "operating_mode",
        "overall_status",
        "activated_agents",
        "skipped_agents",
        "findings",
        "safety_decisions",
        "approved_recommendations",
        "rejected_recommendations",
        "provenance",
        "overall_confidence",
        "explanation",
    ]:
        assert key in data


def test_missing_data_degrades_gracefully():
    result = run_assessment(_load("missing_data.json"))
    assert result.correlation_id
    assert isinstance(result.explanation, str)
