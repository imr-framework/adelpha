"""Connect sensors to Adelpha over the device JSON-RPC WebSocket.

Adelpha is the server. Your Raspberry Pi, or a Python process that owns an
Arduino serial port, is the client. Publish temperature, EMI, and custom
readings with :meth:`DeviceClient.publish` or :func:`publish`.
"""

from __future__ import annotations

from dtam.communication.client import DeviceClient
from dtam.communication.protocol import Publish, Reading, RpcError, SensorGroups

__all__ = [
    "DeviceClient",
    "Publish",
    "Reading",
    "RpcError",
    "SensorGroups",
    "connect",
    "publish",
]


def connect(url: str, device_id: str, token: str, *, journal_path=None) -> DeviceClient:
    """Build a device client. ``url`` is ``ws[s]://host:port/ws/DEVICE_ID``."""
    return DeviceClient(url, device_id, token, journal_path=journal_path)


async def publish(client: DeviceClient, *, temperature=(), emi=(), custom=(), acknowledge=False):
    """Send one sensor snapshot. Missing channels must be omitted or marked missing, never zero."""
    return await client.publish(
        temperature=temperature,
        emi=emi,
        custom=custom,
        acknowledge=acknowledge,
    )
