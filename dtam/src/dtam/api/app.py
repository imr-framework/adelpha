"""FastAPI application exposing twin state for GUIs (e.g. Next.js)."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from dtam.agents.core.enums import OperatingMode
from dtam.agents.core.models import DigitalTwinAssessment, DigitalTwinObservation
from dtam.agents.core.orchestrator import run_assessment
from dtam.agents.core.twin_bridge import observation_from_system_state
from dtam.api.schemas import AssessFromTwinRequest, ForecastRequest, HealthResponse
from dtam.api.session import TwinApiSession
from dtam.digital_twin.state.system_state import SystemState
from dtam.domain.measurements import MeasurementBatch


def _cors_origins() -> list[str]:
    raw = os.environ.get(
        "DTAM_CORS_ORIGINS",
        ",".join(
            [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
            ]
        ),
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app(
    *,
    scanner_id: str | None = None,
    environment: str | None = None,
    config_root: Path | str | None = None,
) -> FastAPI:
    """Build the twin REST API (CORS enabled for local GUIs by default)."""

    resolved_scanner = scanner_id or os.environ.get(
        "DTAM_SCANNER_ID", "simulated_scanner"
    )
    resolved_env = environment or os.environ.get("DTAM_ENVIRONMENT", "development")

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        session = TwinApiSession.create(
            scanner_id=resolved_scanner,
            environment=resolved_env,
            config_root=config_root,
        )
        app.state.session = session
        try:
            yield
        finally:
            session.close()

    app = FastAPI(
        title="DTAM Twin API",
        description=(
            "Thin HTTP surface over ThermalMagneticTwin and the deterministic "
            "multi-agent assessment pipeline for dashboards and Next.js GUIs."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def _session() -> TwinApiSession:
        return app.state.session  # type: ignore[no-any-return]

    @app.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        session = _session()
        return HealthResponse(
            status="ok",
            scanner_id=session.scanner_id,
            mode=session.mode.value,
            connected=session.connected,
        )

    @app.get("/twin/state", response_model=SystemState)
    def twin_state(
        predict_horizon_s: float = Query(default=0.0, ge=0.0),
        magnet_heating_rate_c_per_s: float = 0.0,
        magnet_setpoint_c: float | None = None,
        alpha_t_tesla_per_c: float = -5.0e-5,
        use_thermal_pinn: bool = True,
    ) -> SystemState:
        """Read sensors and return the current twin snapshot."""
        try:
            return _session().update_twin(
                predict_horizon_s=predict_horizon_s,
                magnet_heating_rate_c_per_s=magnet_heating_rate_c_per_s,
                magnet_setpoint_c=magnet_setpoint_c,
                alpha_t_tesla_per_c=alpha_t_tesla_per_c,
                use_thermal_pinn=use_thermal_pinn,
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.post("/twin/forecast", response_model=SystemState)
    def twin_forecast(body: ForecastRequest) -> SystemState:
        """Twin update with a required prediction horizon (thermal PINN / fallback)."""
        try:
            return _session().update_twin(
                predict_horizon_s=body.predict_horizon_s,
                magnet_heating_rate_c_per_s=body.magnet_heating_rate_c_per_s,
                magnet_setpoint_c=body.magnet_setpoint_c,
                alpha_t_tesla_per_c=body.alpha_t_tesla_per_c,
                use_thermal_pinn=body.use_thermal_pinn,
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.get("/sensors/batch", response_model=MeasurementBatch)
    def sensors_batch() -> MeasurementBatch:
        """Raw synchronized measurement batch from the active adapter."""
        try:
            return _session().read_batch()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.post("/assess", response_model=DigitalTwinAssessment)
    def assess_observation(
        observation: DigitalTwinObservation,
        mode: str | None = Query(
            default=None,
            description="Optional override: observe | recommend | act",
        ),
    ) -> DigitalTwinAssessment:
        """Run deterministic multi-agent assessment on a supplied observation JSON."""
        try:
            op_mode = OperatingMode(mode) if mode else None
            return run_assessment(observation, mode=op_mode)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.post("/assess/from-twin")
    def assess_from_twin(body: AssessFromTwinRequest) -> dict[str, Any]:
        """Update twin from the live adapter, then run assessment (no LLM)."""
        try:
            op_mode = OperatingMode(body.mode)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        try:
            state = _session().update_twin(
                predict_horizon_s=body.predict_horizon_s,
                magnet_heating_rate_c_per_s=body.magnet_heating_rate_c_per_s,
                magnet_setpoint_c=body.magnet_setpoint_c,
                alpha_t_tesla_per_c=body.alpha_t_tesla_per_c,
                use_thermal_pinn=body.use_thermal_pinn,
            )
            observation = observation_from_system_state(state)
            observation = observation.model_copy(update={"operating_mode": op_mode})
            assessment = run_assessment(observation, mode=op_mode)
            return {
                "ok": True,
                "twin": state.model_dump(mode="json"),
                "assessment": assessment.model_dump(mode="json"),
            }
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.get("/")
    def root() -> dict[str, Any]:
        return {
            "service": "dtam-twin-api",
            "docs": "/docs",
            "health": "/health",
            "endpoints": [
                "GET /twin/state",
                "POST /twin/forecast",
                "GET /sensors/batch",
                "POST /assess",
                "POST /assess/from-twin",
            ],
        }

    return app
