"""ADK-facing tool wrappers around deterministic services."""

from __future__ import annotations

import base64
import json
from typing import Any

from google.adk.tools.tool_context import ToolContext

from .enums import OperatingMode
from .models import DigitalTwinObservation, ProposedAction

_ALLOWED_ASSESSMENT_MODES = tuple(m.value for m in OperatingMode)


def _parse_assessment_mode(mode: str) -> OperatingMode | None:
    """Parse agent assessment mode (observe|recommend|act), not scanner OperationalMode."""
    cleaned = (mode or "").strip().lower()
    if not cleaned:
        return None
    try:
        return OperatingMode(cleaned)
    except ValueError as exc:
        raise ValueError(
            f"Invalid assessment mode {mode!r}. Use one of {_ALLOWED_ASSESSMENT_MODES}. "
            "Do not pass scanner OperationalMode values such as 'simulation'."
        ) from exc


def assess_digital_twin(observation_json: str, mode: str = "") -> dict[str, Any]:
    """Run the full digital-twin assessment pipeline.

    Args:
        observation_json: JSON string for DigitalTwinObservation.
        mode: Optional assessment override: observe|recommend|act.
            Empty keeps the observation's mode. Not scanner OperationalMode
            (simulation/read_only/…).

    Returns:
        Serialized DigitalTwinAssessment dictionary.
    """
    from .orchestrator import run_assessment

    payload = json.loads(observation_json)
    obs = DigitalTwinObservation.model_validate(payload)
    try:
        op_mode = _parse_assessment_mode(mode)
    except ValueError as exc:
        return {"ok": False, "tool": "assess_digital_twin", "error": str(exc)}
    result = run_assessment(obs, mode=op_mode)
    return result.model_dump(mode="json")


def assess_from_twin_scanner(
    scanner_id: str = "simulated_scanner",
    mode: str = "observe",
    predict_horizon_s: float = 0.0,
) -> dict[str, Any]:
    """Read the DTAM twin (adapter → SystemState) and run assessment.

    Bridges `estimate_twin_state` into DigitalTwinObservation without changing
    twin physics. Prefer this when live scanner/sim data is available.

    Args:
        scanner_id: Adapter / profile id (e.g. simulated_scanner).
        mode: Assessment mode only: observe|recommend|act. Default observe.
            Do not pass scanner OperationalMode values like simulation.
        predict_horizon_s: Optional twin forecast horizon in seconds.
    """
    from dtam.tools.state_estimation import estimate_twin_state

    from .orchestrator import run_assessment
    from .twin_bridge import observation_from_twin_tool_payload

    try:
        op_mode = _parse_assessment_mode(mode)
    except ValueError as exc:
        return {"ok": False, "tool": "assess_from_twin_scanner", "error": str(exc)}

    twin_payload = estimate_twin_state(
        scanner_id=scanner_id,
        predict_horizon_s=predict_horizon_s,
    )
    if not twin_payload.get("ok", False):
        return twin_payload
    obs = observation_from_twin_tool_payload(twin_payload)
    if op_mode is not None:
        obs = obs.model_copy(update={"operating_mode": op_mode})
    result = run_assessment(obs)
    return {
        "ok": True,
        "tool": "assess_from_twin_scanner",
        "data": {
            "twin": twin_payload.get("data"),
            "assessment": result.model_dump(mode="json"),
        },
    }


def run_thermal_analysis(observation_json: str) -> dict[str, Any]:
    """Analyze thermal domain of an observation JSON string."""
    from ..thermal_agent.service import analyze_thermal

    obs = DigitalTwinObservation.model_validate(json.loads(observation_json))
    return analyze_thermal(obs).model_dump(mode="json")


def run_magnet_analysis(observation_json: str) -> dict[str, Any]:
    """Analyze magnet/B0 domain of an observation JSON string."""
    from ..magnet_agent.service import analyze_magnet

    obs = DigitalTwinObservation.model_validate(json.loads(observation_json))
    return analyze_magnet(obs).model_dump(mode="json")


def run_emi_analysis(observation_json: str) -> dict[str, Any]:
    """Analyze EMI domain of an observation JSON string."""
    from ..emi_agent.service import analyze_emi

    obs = DigitalTwinObservation.model_validate(json.loads(observation_json))
    return analyze_emi(obs).model_dump(mode="json")


def run_rf_analysis(observation_json: str) -> dict[str, Any]:
    """Analyze RF domain of an observation JSON string."""
    from ..rf_agent.service import analyze_rf

    obs = DigitalTwinObservation.model_validate(json.loads(observation_json))
    return analyze_rf(obs).model_dump(mode="json")


def run_motion_analysis(observation_json: str) -> dict[str, Any]:
    """Analyze motion domain of an observation JSON string."""
    from ..motion_tracking.service import analyze_motion

    obs = DigitalTwinObservation.model_validate(json.loads(observation_json))
    return analyze_motion(obs).model_dump(mode="json")


def run_safety_validation(actions_json: str, mode: str = "recommend") -> dict[str, Any]:
    """Validate proposed actions with deterministic safety policy.

    Args:
        actions_json: JSON list of ProposedAction objects.
        mode: Assessment mode string (observe|recommend|act).
    """
    from ..safety_agent.service import evaluate_actions

    try:
        op_mode = _parse_assessment_mode(mode) or OperatingMode.RECOMMEND
    except ValueError as exc:
        return {"ok": False, "tool": "run_safety_validation", "error": str(exc)}

    actions = [ProposedAction.model_validate(a) for a in json.loads(actions_json)]
    decisions, assessment = evaluate_actions(actions, mode=op_mode)
    return {
        "decisions": [d.model_dump(mode="json") for d in decisions],
        "assessment": assessment.model_dump(mode="json"),
    }


async def plot_twin_forecast_for_chat(
    scanner_id: str = "simulated_scanner",
    predict_horizon_s: float = 60.0,
    n_points: int = 9,
    magnet_heating_rate_c_per_s: float = 0.0,
    magnet_setpoint_c: float = 0.0,
    tool_context: ToolContext | None = None,
) -> dict[str, Any]:
    """Plot a twin forecast trajectory for chat UIs (PNG + series).

    Call this for forecast / prediction / \"what will happen\" questions.
    Returns series data and ``plot_png_base64``. When ADK ToolContext is
    available, also saves an ``image/png`` session artifact. Do not paste
    base64 into the assistant text — the GUI renders the image from the
    tool / artifact response.
    """
    from google.genai import types

    from dtam.tools.state_estimation.forecast_plot import plot_twin_forecast

    result = plot_twin_forecast(
        scanner_id=scanner_id,
        predict_horizon_s=predict_horizon_s,
        n_points=n_points,
        magnet_heating_rate_c_per_s=magnet_heating_rate_c_per_s,
        magnet_setpoint_c=magnet_setpoint_c,
    )
    if not result.get("ok", False):
        return result

    data = result.get("data") or {}
    b64 = data.get("plot_png_base64")
    filename = data.get("plot_filename") or "twin_forecast.png"
    if tool_context is not None and b64:
        try:
            png_bytes = base64.b64decode(b64)
            artifact = types.Part.from_bytes(data=png_bytes, mime_type="image/png")
            version = await tool_context.save_artifact(
                filename=filename,
                artifact=artifact,
            )
            data["artifact_name"] = filename
            data["artifact_version"] = version
        except Exception as exc:  # noqa: BLE001
            data["artifact_error"] = str(exc)

    return result

