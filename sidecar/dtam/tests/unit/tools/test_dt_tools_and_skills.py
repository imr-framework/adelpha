"""Tests for DT tools and ADK skills wiring."""

from __future__ import annotations

from dtam.memory.working import WORKING_STATE
from dtam.skills import (
    AGENT_SKILL_NAMES,
    load_skills_for_agent,
    skill_toolset_for_agent,
)
from dtam.tools.b1 import interpret_b1_map, read_coil_sensor
from dtam.tools.emi import classify_emi_noise, read_emi_sensor_summary
from dtam.tools.gradient import (
    evaluate_eddy_current_model,
    interpret_eddy_current_results,
)
from dtam.tools.magnet import generate_b0_map_summary, magnet_designer_status
from dtam.tools.orchestrator import (
    get_working_state,
    pinn_model_status,
    run_pinn_inference,
    search_knowledge,
    set_working_state,
)
from dtam.tools.registry import AGENT_TOOL_GROUPS, tools_for_agent
from dtam.tools.thermal import analyze_thermal_gradient, read_temperature_channels


def setup_function() -> None:
    WORKING_STATE.clear()


def test_pinn_upload_slot_reports_status() -> None:
    status = pinn_model_status()
    assert status["ok"] is True
    assert "data/models/pinn" in status["data"]["model_dir"].replace("\\", "/")
    if not status["data"]["present"]:
        missing = run_pinn_inference("{}")
        assert missing["ok"] is False
        assert missing["error_code"] == "PINN_MODEL_MISSING"


def test_working_state_and_knowledge_search() -> None:
    set_working_state("orchestrator.plan", '{"step": 1}')
    got = get_working_state("orchestrator.plan")
    assert got["data"]["found"] is True
    assert got["data"]["value"]["step"] == 1
    hits = search_knowledge("orchestrator", domain="orchestrator")
    assert hits["ok"] is True


def test_magnet_designer_status_and_b0_summary() -> None:
    status = magnet_designer_status()
    assert status["ok"] is True
    # Cloned locally in this workspace during development.
    assert "HalbachMRIDesigner" in status["data"]["root"]
    b0 = generate_b0_map_summary(field_strength_t=0.048, grid_n=11)
    assert b0["ok"] is True
    assert b0["data"]["shape"] == [11, 11, 11]


def test_emi_thermal_b1_gradient_tools() -> None:
    emi = read_emi_sensor_summary("simulated_scanner")
    assert emi["ok"] is True
    assert emi["data"]["source"] == "scanner_adapter"
    clf = classify_emi_noise(emi["data"]["peak_frequency_hz"], emi["data"]["rms"])
    assert clf["ok"] is True

    temps = read_temperature_channels("simulated_scanner")
    assert temps["ok"] is True
    assert len(temps["data"]["channels"]) >= 3
    assert all("temp_" in c["sensor_id"] for c in temps["data"]["channels"])
    grad = analyze_thermal_gradient()
    assert grad["ok"] is True

    from dtam.tools.rf import read_rf_noise_channels

    rf = read_rf_noise_channels("simulated_scanner")
    assert rf["ok"] is True
    assert rf["data"]["noise_floor_dbm_per_hz"] is not None

    coil = read_coil_sensor(reflected_power_fraction=0.04)
    assert coil["ok"] is True
    b1 = interpret_b1_map(0.95, 0.8)
    assert b1["data"]["status"] == "acceptable"

    eddy = evaluate_eddy_current_model(tau_ms=1.0, amplitude_fraction=0.03)
    assert eddy["ok"] is True
    interp = interpret_eddy_current_results(eddy["data"]["peak_residual"])
    assert interp["ok"] is True

    assert "orchestrator" in AGENT_TOOL_GROUPS
    assert tools_for_agent("emi")
    assert tools_for_agent("b1")


def test_skills_and_toolsets_load_for_all_diagram_agents() -> None:
    for key in AGENT_SKILL_NAMES:
        skills = load_skills_for_agent(key)
        assert len(skills) == len(AGENT_SKILL_NAMES[key])
        tools = tools_for_agent(key)
        assert len(tools) == len(AGENT_TOOL_GROUPS[key])
        toolset = skill_toolset_for_agent(key)
        assert toolset is not None
