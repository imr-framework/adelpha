---
title: Adelpha MRI device link
description: Connect a Raspberry Pi or Arduino bridge to Adelpha over JSON-RPC so temperature, EMI, and custom sensors appear on the Digital Twin.
icon: lucide/cable
---

# Device link

Adelpha is the **server**. Your Raspberry Pi, or a Python process that talks to an Arduino, is the **client**.

Boards do not open the Twin HTTP port. They connect to a WebSocket listener that Adelpha starts with the Twin runtime. Arduino never attaches to Adelpha over USB serial; a small Python program owns the serial port and uses `adelpha.telemetry`.

``` mermaid
flowchart LR
  pi[Raspberry Pi]
  arduino[Arduino]
  bridge[User Python bridge]
  adelpha[Adelpha listener]
  twin[Digital Twin]
  pi -->|"WebSocket JSON-RPC"| adelpha
  arduino -->|serial| bridge
  bridge -->|"WebSocket JSON-RPC"| adelpha
  adelpha --> twin
```

There is no Start server button. The listener starts when Adelpha finds `devices.json` and the Twin service is healthy.

## Set it up in Adelpha

1. Open **Settings → Devices**.
2. Click **Open config folder**. That folder is the DTAM config directory on this computer.
3. Copy `sidecar/dtam/src/dtam/communication/devices.example.json` from the repository into that folder as **`devices.json`**.
4. Replace every placeholder token with a unique random string of at least 24 characters. Set `"host": "0.0.0.0"` if a Pi on Ethernet should reach this PC. Set each device’s `scanner_id` to the hardware profile you will use (for example `halbach_48mt`).
5. In **Settings → Digital Twin**, select that same hardware profile. Simulation ignores device publications.
6. Restart Adelpha, or **Settings → Digital Twin → Restart**.

**Settings → Devices → Adelpha device link** then shows the listen port and `ws://…/ws/<device_id>`. **Not configured** means `devices.json` is missing. **Unavailable** means the file or port failed.

Typical location of the file (desktop app):

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Application Support/org.adelpha.digital-twin-ui/dtam/devices.json` |
| Windows | `%APPDATA%\org.adelpha.digital-twin-ui\dtam\devices.json` |
| Linux | `~/.config/org.adelpha.digital-twin-ui/dtam/devices.json` |

```json
{
  "host": "0.0.0.0",
  "port": 8765,
  "allow_control": false,
  "devices": {
    "pi-01": {
      "token": "REPLACE_WITH_A_RANDOM_DEVICE_TOKEN",
      "scanner_id": "halbach_48mt",
      "allowed_actuators": {
        "cooling-01": ["set_enabled"]
      }
    }
  }
}
```

The client URL is `ws://<this-computer>:8765/ws/pi-01`. Put the token in the `Authorization: Bearer …` header, never in the URL.

!!! warning "Physical control"
    Sensor streaming does not require **Physical control**. Actuator commands stay rejected until all of these are true: a hardware scanner profile is selected, `allow_control` is `true` in `devices.json`, and **Settings → Devices → Physical control** is on. Device-local interlocks remain authoritative.

## Protocol

Messages are JSON-RPC 2.0. One family publishes sensors; the other sets actuators. Structure is defined by `sidecar/dtam/src/dtam/communication/adelpha-device-v1.schema.json`. Behaviour (timing, retries, quality) is in `sidecar/dtam/src/dtam/communication/PROTOCOL.md`.

Include an `id` only when you want a response. Adelpha echoes that `id`. Omit `id` for a continuous stream; those notifications must not be answered. Do not send a separate `requires_response` flag.

Identify a sensor as `(device_id, sensor_id)`. `boot_id` plus `sequence` distinguish restarts from duplicates. `sample_time_ms` is milliseconds since device boot; Adelpha also records reception time.

| Field | Rule |
| --- | --- |
| `value` | JSON number or `null`. Non-finite numbers are rejected. Missing data is `null`, never zero. |
| `quality` | `valid`, `suspect`, `invalid`, or `missing`. A null value must be `missing` or `invalid`. |
| Temperature | Unit `degC`. Several sensors per publication are allowed. |
| EMI | `quantity` is required. `voltage_rms` uses unit `V`. |
| Custom | `quantity` is required. `dashboard_id` is optional. |

A command names an operation such as `set_enabled`. Prefer “set enabled to true” over a toggle so a retry cannot invert the output. The device first answers `accepted`, then notifies `actuators.status` when the controller output is applied. That does not prove the plant responded; sensor readings close the loop. An acknowledgement timeout means **unknown**, not failed.

## Raspberry Pi client

```bash
pip install adelpha
```

Point the client at the URL shown in Settings. Sensors use `telemetry`; actuator handlers use `feedback`. Details: [Python package](python.md).

```python
import asyncio
import os

from adelpha import feedback, telemetry

client = telemetry.connect(
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
    # Enforce local interlocks here. Return the applied output.
    return {"enabled": enabled}


async def acquire(device):
    while True:
        temperature = 28.4  # replace with your readout
        await telemetry.publish(
            device,
            temperature=[
                {
                    "sensor_id": 1,
                    "value": temperature,
                    "unit": "degC",
                    "role": "magnet",
                    "quality": "valid",
                }
            ],
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

```bash
export ADELPHA_URL="ws://192.168.1.10:8765/ws/pi-01"
export ADELPHA_DEVICE_ID="pi-01"
export ADELPHA_DEVICE_TOKEN="the-token-from-devices-json"
python pi_device.py
```

A fuller template, including a hardware callback, is `sidecar/dtam/src/dtam/communication/examples/pi_device.py`.

Continuous `publish()` omits JSON-RPC `id`. Pass `acknowledge=True` when you need Adelpha to confirm the sequence number.

## Arduino through Python

The Arduino sends one compact JSON object per newline. The bridge timestamps receipt; it cannot recover the microcontroller’s acquisition clock.

Example Arduino line:

```json
{"temperature":[{"sensor_id":1,"value":25.1,"unit":"degC","role":"magnet"}]}
```

Install `pyserial` only on this bridge host:

```python
import argparse
import asyncio
import json
import os

import serial

from adelpha.telemetry import DeviceClient


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", required=True)
    parser.add_argument("--baud", type=int, default=115200)
    args = parser.parse_args()
    device = DeviceClient(
        os.environ["ADELPHA_URL"],
        os.environ["ADELPHA_DEVICE_ID"],
        os.environ["ADELPHA_DEVICE_TOKEN"],
    )
    with serial.Serial(args.port, args.baud, timeout=1) as arduino:

        async def acquire(client):
            while True:
                line = await asyncio.to_thread(arduino.read_until, b"\n", 4096)
                if not line.endswith(b"\n"):
                    arduino.reset_input_buffer()
                    continue
                try:
                    readings = json.loads(line)
                except (ValueError, UnicodeError):
                    continue
                await client.publish(**readings, acknowledge=True)

        try:
            await device.run(acquire)
        finally:
            await device.close()


if __name__ == "__main__":
    asyncio.run(main())
```

The checked-in copy is `sidecar/dtam/src/dtam/communication/examples/arduino_bridge.py`.

## After it is connected

Each `sensors.publish` is a **snapshot**. Adelpha uses only the sensors in that message. To keep magnet temperature while EMI is down, send both: temperature `valid`, EMI `missing`. Do not send `0` for a disconnected sensor.

```json
{
  "temperature": [
    {"sensor_id": 1, "value": 26.5, "unit": "degC", "role": "magnet", "quality": "valid"}
  ],
  "emi": [
    {"sensor_id": 2, "value": null, "unit": "V", "quantity": "voltage_rms", "quality": "missing"}
  ]
}
```

Usable values must be recent (about 30 seconds). The Twin maps them as follows:

| Publication | Twin / UI |
| --- | --- |
| Temperature `role: magnet` | Magnet temperature plot, Thermal card, \(B_0\) estimate |
| Temperature `role: room` | Thermal card room row |
| EMI `quantity: voltage_rms` | EMI RMS on Telemetry. No hardware spectrum. |
| Custom `rf_noise_floor` or `noise_floor` | RF noise card |
| Other custom quantities | **Raw sensors**, `GET /sensors/batch`, `GET /devices/{id}/readings` |

### What you see

If nothing usable has arrived, the dashboard and Telemetry panel show the waiting view. **Configure sensors** and **Check connections** open **Settings → Devices**. Twin notes such as “EMI RMS reported missing.” appear on that view when a board has already published.

Once any usable channel arrives, connected families render and the others stay explicit:

| Situation | Dashboard | Telemetry |
| --- | --- | --- |
| Magnet temperature received | Temperature plot | Thermal values |
| Magnet temperature absent | “Temperature sensor not connected” | “No usable temperature measurements.” |
| EMI RMS received | RMS stamp; “this protocol does not publish a spectrum” | EMI RMS; no waveform |
| EMI absent | “EMI sensor not connected” | “No usable EMI RMS.” |
| Johnson / thermal noise | “Johnson noise is simulated only; it is not measured in hardware” | — |
| \(B_0\) without magnet temperature | — | “B₀ is estimated from magnet temperature.” |

**Notes** always lists magnet temperature, room temperature, and EMI RMS as **received**, **not connected**, **reported missing**, **reported invalid and was not plotted**, or **older than 30 seconds**. RF and custom appear in Notes only when the device published them.

If nothing appears: confirm the Twin is not in simulation, `scanner_id` in `devices.json` matches **Settings → Digital Twin**, and the device row in **Settings → Devices** says **Connected**.
