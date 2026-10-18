"""Control operations: actuator handlers that Adelpha may call on a device.

Register handlers with :func:`register` or :meth:`DeviceClient.actuator`.
Adelpha rejects ``actuators.set`` until a hardware profile is selected,
``allow_control`` is true in ``devices.json``, and Physical control is on.
Device-local interlocks remain authoritative. Sensor streaming does not
require this module.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from dtam.communication.client import DeviceClient
from dtam.communication.protocol import (
    Actuator,
    Command,
    CommandStatus,
    Registration,
    RpcError,
)

__all__ = [
    "Actuator",
    "Command",
    "CommandStatus",
    "DeviceClient",
    "Registration",
    "RpcError",
    "register",
]


def register(
    client: DeviceClient,
    actuator_id: str,
    operation: str,
    *,
    argument_schema: dict[str, Any],
) -> Callable:
    """Decorator that advertises one actuator operation and journals command IDs.

    ``journal_path`` must be set on ``client`` so accepted commands survive a restart.
    """
    return client.actuator(actuator_id, operation, argument_schema=argument_schema)
