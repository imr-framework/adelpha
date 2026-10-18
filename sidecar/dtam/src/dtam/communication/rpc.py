"""Bidirectional JSON-RPC peer; socket framing is supplied by the transport."""

import asyncio
import uuid

from pydantic import ValidationError

from .protocol import MAX_BATCH, RpcError, decode, encode


class Peer:
    def __init__(self, send, dispatch):
        self.send = send
        self.dispatch = dispatch
        self.pending = {}
        self.send_lock = asyncio.Lock()

    async def write(self, value):
        async with self.send_lock:
            await asyncio.wait_for(self.send(encode(value)), 10)

    async def call(self, method, params, timeout=10):
        if len(self.pending) >= 32:
            raise RpcError(-32002, "Too many pending requests")
        request_id = uuid.uuid4().hex
        future = asyncio.get_running_loop().create_future()
        self.pending[request_id] = future
        try:
            await self.write(
                {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}
            )
            return await asyncio.wait_for(future, timeout)
        finally:
            self.pending.pop(request_id, None)

    async def notify(self, method, params):
        await self.write({"jsonrpc": "2.0", "method": method, "params": params})

    async def receive(self, raw):
        try:
            message = decode(raw)
        except RpcError as exc:
            await self.write(exc.response(None))
            return
        if isinstance(message, list):
            if not message or len(message) > MAX_BATCH:
                await self.write(RpcError(-32600, "Invalid batch").response(None))
                return
            responses = []
            for item in message:
                result = await self.handle(item)
                if result is not None:
                    responses.append(result)
            if responses:
                await self.write(responses)
        else:
            result = await self.handle(message)
            if result is not None:
                await self.write(result)

    async def handle(self, message):
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
            return RpcError(-32600, "Invalid Request").response(None)
        request_id = message.get("id")
        if request_id is not None and type(request_id) not in (int, str):
            return RpcError(-32600, "Invalid request id").response(None)
        if "method" not in message:
            future = self.pending.get(request_id)
            if future is not None and not future.done():
                if ("result" in message) == ("error" in message):
                    future.set_exception(RpcError(-32600, "Malformed response"))
                elif "error" in message:
                    error = message["error"]
                    if (
                        not isinstance(error, dict)
                        or type(error.get("code")) is not int
                        or not isinstance(error.get("message"), str)
                    ):
                        future.set_exception(
                            RpcError(-32600, "Malformed error response")
                        )
                    else:
                        future.set_exception(
                            RpcError(error["code"], error["message"], error.get("data"))
                        )
                else:
                    future.set_result(message["result"])
            elif "result" not in message and "error" not in message:
                return RpcError(-32600, "Invalid Request").response(None)
            return None
        if not isinstance(message["method"], str):
            return RpcError(-32600, "Invalid method").response(request_id)
        try:
            params = message.get("params", {})
            if not isinstance(params, (dict, list)):
                raise RpcError(-32602, "Invalid params")
            result = await self.dispatch(message["method"], params, "id" in message)
            response = {"jsonrpc": "2.0", "id": request_id, "result": result}
        except RpcError as exc:
            response = exc.response(request_id)
        except (ValidationError, ValueError, TypeError) as exc:
            response = RpcError(-32602, "Invalid params", str(exc)[:500]).response(
                request_id
            )
        except Exception:
            response = RpcError(-32603, "Internal error").response(request_id)
        return response if "id" in message else None

    def close(self):
        for future in self.pending.values():
            if not future.done():
                future.set_exception(
                    ConnectionError(
                        "Device connection closed; command outcome may be unknown"
                    )
                )
        self.pending.clear()
