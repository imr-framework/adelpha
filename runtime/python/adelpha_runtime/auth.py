from __future__ import annotations

from urllib.parse import parse_qs

from starlette.types import ASGIApp, Receive, Scope, Send


class SessionTokenMiddleware:
    """Require the per-session token on HTTP and WebSocket connections.

    CORS preflight (OPTIONS) is allowed through without a token.
    """

    def __init__(self, app: ASGIApp, token: str) -> None:
        self.app = app
        self.token = token

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        kind = scope["type"]
        if kind == "http":
            if scope.get("method") == "OPTIONS":
                await self.app(scope, receive, send)
                return
            if _http_token(scope) != self.token:
                await _send_http_unauthorized(send)
                return
        elif kind == "websocket":
            if _ws_token(scope) != self.token:
                await send({"type": "websocket.close", "code": 4401, "reason": "Unauthorized"})
                return
        await self.app(scope, receive, send)


def _header_map(scope: Scope) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in scope.get("headers") or []:
        out[key.decode("latin1").lower()] = value.decode("latin1")
    return out


def _query_token(scope: Scope) -> str:
    raw = scope.get("query_string") or b""
    qs = parse_qs(raw.decode("latin1"), keep_blank_values=False)
    values = qs.get("token") or []
    return values[0].strip() if values else ""


def _bearer(header: str) -> str:
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return ""


def _http_token(scope: Scope) -> str:
    headers = _header_map(scope)
    return _bearer(headers.get("authorization", "")) or _query_token(scope)


def _ws_token(scope: Scope) -> str:
    headers = _header_map(scope)
    return _bearer(headers.get("authorization", "")) or _query_token(scope)


async def _send_http_unauthorized(send: Send) -> None:
    body = b'{"detail":"Unauthorized"}'
    await send(
        {
            "type": "http.response.start",
            "status": 401,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode("ascii")),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
