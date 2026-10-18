# Adelpha

Python library for [Adelpha MRI](https://github.com/imr-framework/adelpha): connect sensors, run control handlers, and call Engineering Studio design functions.

```bash
pip install adelpha
```

```python
from adelpha import telemetry, feedback
```

Adelpha is the WebSocket **server**. Your Raspberry Pi, or a Python process that talks to an Arduino, is the **client**. Arduino never opens a serial session to Adelpha.

## Telemetry (sensors)

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
        )
        await asyncio.sleep(1)


asyncio.run(client.run(acquire))
```

`ADELPHA_URL` is `ws://<host>:8765/ws/<device_id>`. Put the token in the environment, never in the URL. Missing sensors use `value: null` with quality `missing` or `invalid`, never zero.

## Feedback (control)

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

Adelpha rejects actuator commands until a hardware scanner profile is selected, `allow_control` is true in `devices.json`, and **Settings → Devices → Physical control** is on. Device-local interlocks remain authoritative.

## Other modules

| Import | Purpose |
| --- | --- |
| `adelpha.twin` | Digital-twin estimators, state, `bootstrap()` |
| `adelpha.magnet` | Halbach array geometry (`design`, `export_cad`) |
| `adelpha.coil` | Gradient-coil request builders (pyCoilGen to run) |
| `adelpha.rfcoil` | Solenoid RF coil request builders |
| `adelpha.shim` | Passive shim request builders |
| `adelpha.fem` | STEP magnetostatics (Gmsh + Elmer to run) |
| `adelpha.domain` | Measurements, units, scanner identity |
| `adelpha.scanners` | Simulated and hardware adapters |
| `adelpha.config` | Profile loading |
| `adelpha.acquisition` | Sensor readers and drivers |
| `adelpha.safety` | Limits and pre-action checks |
| `adelpha.simulation` | Virtual plant models |
| `adelpha.agents` | Agent specialists (`pip install adelpha[agents]`) |
| `adelpha.workflows` | Monitoring and intervention workflows |
| `adelpha.tools` | Agent tool registry |
| `adelpha.api` | Twin HTTP `create_app` (`pip install adelpha[twin]`) |

Optional extras: `adelpha[twin]`, `adelpha[agents]`, `adelpha[pinn]`.

The imaging console is not part of this package.

## Publish (maintainers)

From the repository root, after tests pass:

```bash
uv build
uv publish
```

Or `python -m build` and `twine upload dist/*`.
