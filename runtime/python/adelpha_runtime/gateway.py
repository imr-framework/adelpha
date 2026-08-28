from __future__ import annotations

import asyncio
import logging
import os
from contextlib import AsyncExitStack, asynccontextmanager
from typing import Any, AsyncIterator

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask
from starlette.responses import Response

from adelpha_runtime.auth import SessionTokenMiddleware
from adelpha_runtime.paths import RUNTIME_VERSION, cors_origins
from adelpha_runtime.registry import ServiceRegistry

log = logging.getLogger("adelpha.runtime.gateway")


class GoogleApiKeyBody(BaseModel):
    api_key: str | None = None

_HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}

# Browser CORS headers must not reach ADK. The UI talks to this gateway only;
# ADK would 403 "origin not allowed" for tauri://localhost and Vite origins.
_DROP_UPSTREAM = _HOP_BY_HOP | {
    "authorization",
    "origin",
    "referer",
    "sec-fetch-site",
    "sec-fetch-mode",
    "sec-fetch-dest",
    "sec-fetch-user",
}


def create_gateway_app(
    registry: ServiceRegistry,
    *,
    token: str,
    session_id: str,
    extra: dict[str, Any] | None = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with AsyncExitStack() as stack:
            for state in registry.states.values():
                mount = state.mount
                if mount is None:
                    continue
                router = getattr(mount, "router", None)
                ctx = getattr(router, "lifespan_context", None) if router is not None else None
                if ctx is not None:
                    await stack.enter_async_context(ctx(mount))
                    log.info("started lifespan for %s", state.definition.id)
            yield
            registry.stop_all()

    app = FastAPI(
        title="Adelpha Python runtime",
        version=RUNTIME_VERSION,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
    )
    app.state.registry = registry
    app.state.session_id = session_id
    app.state.extra = extra or {}

    app.add_middleware(SessionTokenMiddleware, token=token)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for state in registry.states.values():
        if state.mount is None:
            continue
        if state.definition.id == "twin":
            app.mount("/api/dtam", state.mount)
        elif state.definition.id == "console":
            app.mount("/api/mri", state.mount)

    @app.get("/runtime/health")
    def runtime_health() -> dict[str, Any]:
        failed = registry.required_failed()
        return {
            "ok": not failed,
            "version": RUNTIME_VERSION,
            "session": session_id,
            "services": registry.snapshot(),
            "required_failed": failed,
        }

    @app.get("/runtime/services")
    def runtime_services() -> dict[str, Any]:
        return {"services": registry.snapshot()}

    @app.post("/runtime/services/{service_id}/start")
    def start_service(service_id: str) -> dict[str, Any]:
        if service_id not in registry.states:
            raise HTTPException(status_code=404, detail=f"Unknown service {service_id}")
        state = registry.start(service_id)
        return {"service": registry.snapshot()[service_id], "status": state.status}

    @app.post("/runtime/secrets/google-api-key")
    def configure_google_api_key(payload: GoogleApiKeyBody) -> dict[str, Any]:
        key = (payload.api_key or "").strip()
        if "agents" not in registry.states:
            raise HTTPException(status_code=404, detail="Agent service is not registered")
        if key:
            os.environ["GOOGLE_API_KEY"] = key
            registry.stop("agents")
            state = registry.start("agents")
            if state.status != "healthy":
                raise HTTPException(
                    status_code=503,
                    detail=state.detail or "Failed to start the agent runtime with this key.",
                )
            return {"ok": True, "agents": registry.snapshot()["agents"]}
        os.environ.pop("GOOGLE_API_KEY", None)
        registry.stop("agents")
        return {"ok": True, "agents": registry.snapshot()["agents"]}

    @app.get("/runtime/diagnostics")
    def diagnostics() -> dict[str, Any]:
        return {
            "adelpha_runtime": RUNTIME_VERSION,
            "session": session_id,
            "services": registry.snapshot(),
            **(extra or {}),
        }

    @app.post("/runtime/shutdown")
    async def shutdown(request: Request) -> JSONResponse:
        registry.stop_all()
        server = getattr(request.app.state, "uvicorn_server", None)
        if server is not None:
            server.should_exit = True
        return JSONResponse({"ok": True})

    @app.api_route("/api/agents/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    async def proxy_agents(path: str, request: Request) -> Response:
        state = registry.states.get("agents")
        if state is None:
            raise HTTPException(status_code=404, detail="Agent service is not registered")
        if state.status != "healthy" or not state.internal_port:
            state = await asyncio.to_thread(registry.start, "agents")
        if state.status != "healthy" or not state.internal_port:
            detail = state.detail.strip() if state.detail else ""
            raise HTTPException(
                status_code=503,
                detail=detail
                or "Agent service is not running. Add a Google API key, then retry.",
            )
        url = f"http://127.0.0.1:{state.internal_port}/{path}"
        if request.url.query:
            url = f"{url}?{request.url.query}"
        headers = {
            key: value
            for key, value in request.headers.items()
            if key.lower() not in _DROP_UPSTREAM
        }
        body = await request.body()
        try:
            client: httpx.AsyncClient = request.app.state.httpx
        except AttributeError:
            client = httpx.AsyncClient(timeout=None)
            request.app.state.httpx = client
        upstream = await client.send(
            client.build_request(request.method, url, headers=headers, content=body or None),
            stream=True,
        )
        filtered = {
            key: value
            for key, value in upstream.headers.items()
            if key.lower() not in _HOP_BY_HOP
        }
        return StreamingResponse(
            upstream.aiter_bytes(),
            status_code=upstream.status_code,
            headers=filtered,
            background=BackgroundTask(upstream.aclose),
        )

    return app
