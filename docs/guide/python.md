---
title: Adelpha Python package
description: Install adelpha from PyPI and import telemetry, feedback, and Engineering Studio functions.
icon: lucide/package
---

# Python package

`pip install adelpha` installs the library used by Raspberry Pi scripts, Arduino bridges, and notebooks. It is not the desktop app.

```python
from adelpha import telemetry, feedback
```

Sensor devices use **telemetry**. Actuator handlers use **feedback**. Do not import a `dtam` client for new scripts.

## Install

```bash
pip install adelpha
```

Optional extras:

| Extra | When |
| --- | --- |
| `adelpha[twin]` | Twin HTTP app and scientific plotting extras |
| `adelpha[agents]` | Agent specialists (Google ADK) |
| `adelpha[pinn]` | Thermal PINN artifacts |

The imaging console is GPL-3 and is **not** on PyPI with this package.

## Telemetry

Adelpha is the WebSocket server. Your board is the client. Set `ADELPHA_URL` to the address shown in **Settings → Devices**, for example `ws://192.168.1.10:8765/ws/pi-01`.

```python
import asyncio
import os

from adelpha import telemetry

client = telemetry.connect(
    os.environ["ADELPHA_URL"],
    os.environ["ADELPHA_DEVICE_ID"],
    os.environ["ADELPHA_DEVICE_TOKEN"],
)


async def acquire(device):
    while True:
        await telemetry.publish(
            device,
            temperature=[
                {
                    "sensor_id": 1,
                    "value": 28.4,
                    "unit": "degC",
                    "role": "magnet",
                    "quality": "valid",
                }
            ],
            acknowledge=True,
        )
        await asyncio.sleep(1)


async def main():
    try:
        await client.run(acquire)
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
```

Missing data is `value: null` with quality `missing` or `invalid`, never zero. Protocol and dashboard mapping: [Device link](devices.md).

## Feedback

```python
from adelpha import feedback, telemetry

client = telemetry.DeviceClient(
    os.environ["ADELPHA_URL"],
    os.environ["ADELPHA_DEVICE_ID"],
    os.environ["ADELPHA_DEVICE_TOKEN"],
    journal_path="./commands.sqlite3",
)


@feedback.register(
    client,
    "cooling-01",
    "set_enabled",
    argument_schema={
        "type": "object",
        "properties": {"enabled": {"type": "boolean"}},
        "required": ["enabled"],
        "additionalProperties": False,
    },
)
async def cooling(enabled):
    return {"enabled": enabled}
```

`journal_path` is required for actuators so `command_id` survives a restart. Adelpha still rejects `actuators.set` until a hardware profile is selected, `allow_control` is true, and **Physical control** is on.

## Engineering modules

```python
from adelpha import coil, fem, magnet, rfcoil, shim, twin

geometry = magnet.design({"magnets": 16, "rings": 5})
request = coil.coil_request({"axis": "y", "shape": "cylinder"})
```

| Module | Role |
| --- | --- |
| `adelpha.twin` | Estimators, system state, `bootstrap()` |
| `adelpha.magnet` | Halbach array cubes and CAD export |
| `adelpha.coil` | Gradient-coil request / `simulate` (needs pyCoilGen) |
| `adelpha.rfcoil` | Solenoid RF request / `simulate` |
| `adelpha.shim` | Passive shim request / `simulate` |
| `adelpha.fem` | STEP magnetostatics (needs Gmsh and Elmer) |
| `adelpha.domain` | Measurements and units |
| `adelpha.scanners` | Scanner adapters |
| `adelpha.acquisition` | Hardware readers |
| `adelpha.simulation` | Virtual plant models |
| `adelpha.agents` | Agent specialists |
| `adelpha.tools` | Agent tool registry |
| `adelpha.api` | `create_app()` for the Twin HTTP service |

Halbach `design()` builds geometry. It does not evaluate \(B_0\). Coil, RF, shim, and FEM **run** functions expect the same worker environments as Engineering Studio.

## Publish the wheel

From the repository root, after tests:

```bash
uv build
uv publish
```

Source layout: `python/adelpha/`. Implementation for the device protocol remains under `dtam/src/dtam/communication/`; the public names are `telemetry` and `feedback`.
