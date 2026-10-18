"""Device-side integration API for Adelpha's JSON-RPC/WebSocket transport."""

from .client import DeviceClient
from .protocol import RpcError

__all__ = ["DeviceClient", "RpcError"]
