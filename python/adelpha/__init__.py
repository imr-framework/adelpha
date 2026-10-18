"""Adelpha MRI Python library.

Public imports use Adelpha names. Sensor devices use ``telemetry``; actuator
control uses ``feedback``. The desktop Twin still loads its own internal stack.

Typical device script::

    from adelpha import telemetry, feedback

    client = telemetry.DeviceClient(url, device_id, token)
    await telemetry.publish(client, temperature=[...])

    @feedback.register(client, "cooling-01", "set_enabled", argument_schema=schema)
    async def cooling(enabled):
        return {"enabled": enabled}
"""

from __future__ import annotations

from importlib import import_module
from typing import Any

from adelpha._paths import ensure_impl_path

ensure_impl_path()

__version__ = "0.1.0"

_PUBLIC = {
    "telemetry": "adelpha.telemetry",
    "feedback": "adelpha.feedback",
    "twin": "adelpha.twin",
    "magnet": "adelpha.magnet",
    "coil": "adelpha.coil",
    "rfcoil": "adelpha.rfcoil",
    "shim": "adelpha.shim",
    "fem": "adelpha.fem",
    "domain": "adelpha.domain",
    "scanners": "adelpha.scanners",
    "config": "adelpha.config",
    "acquisition": "adelpha.acquisition",
    "safety": "adelpha.safety",
    "simulation": "adelpha.simulation",
    "agents": "adelpha.agents",
    "workflows": "adelpha.workflows",
    "tools": "adelpha.tools",
    "api": "adelpha.api",
}

__all__ = ["__version__", *sorted(_PUBLIC)]


def __getattr__(name: str) -> Any:
    target = _PUBLIC.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    return import_module(target)
