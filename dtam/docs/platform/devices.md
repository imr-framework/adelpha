---
icon: lucide/cable
---

# Device protocol

Adelpha (the Twin process) is the **WebSocket server**. A Raspberry Pi, or a user Python process that owns an Arduino serial port, is the **client**.

Arduino does not open a serial session to DTAM. The same `DeviceClient` talks JSON-RPC over WebSocket in both cases.

| Connection | Framing |
| --- | --- |
| Raspberry Pi ↔ Adelpha | One JSON-RPC object per WebSocket text frame at `ws[s]://host:port/ws/{device_id}` |
| Arduino ↔ user Python | User-defined serial; that process then uses `DeviceClient` |

Bearer tokens go in `Authorization`, never in the URL. Messages are at most 64 KiB. Schema: `src/dtam/communication/adelpha-device-v1.schema.json`. Timing and retries: `src/dtam/communication/PROTOCOL.md`.

The listener is **not** the Twin HTTP port (`:8080`). HTTP routes under `/devices` inspect and command; boards connect to the dedicated WebSocket port from `devices.json` (default `8765`).

## Start the listener

In the Adelpha desktop app, put `devices.json` in the folder opened by **Settings → Devices → Open config folder**, then restart the runtime. There is no Start server control; the Twin lifespan starts the listener when that file is present.

Without Adelpha, the Twin API does the same if `ADELPHA_DEVICE_CONFIG` or `devices.json` under `ADELPHA_CONFIG_DIR` / `DTAM_CONFIG_DIR` exists.

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

Use `"host": "0.0.0.0"` so a board on Ethernet can connect. Tokens must be unique, random, and at least 24 characters. `scanner_id` must match the Twin profile. Example file: `src/dtam/communication/devices.example.json`.

!!! danger "Commands are off by default"
    `allow_control` in `devices.json` is false until you change it. Adelpha still requires a hardware profile (not simulation) and an explicit **Physical control** enablement before `actuators.set` is forwarded. Device-local interlocks remain authoritative.

## JSON-RPC

Include `id` (string or integer, not float) when a response is required. Omit `id` for a notification. Notifications must not receive a response.

### Sensors (`sensors.publish`)

```json
{
  "jsonrpc": "2.0",
  "method": "sensors.publish",
  "params": {
    "protocol_version": "1.0",
    "device_id": "pi-01",
    "boot_id": "boot-7",
    "sequence": 1042,
    "sent_time_ms": 125000,
    "sensors": {
      "temperature": [
        {
          "sensor_id": 1,
          "sample_time_ms": 125000,
          "value": 28.4,
          "unit": "degC",
          "role": "magnet",
          "quality": "valid"
        }
      ],
      "emi": [
        {
          "sensor_id": 2,
          "sample_time_ms": 125000,
          "quantity": "voltage_rms",
          "value": 0.012,
          "unit": "V",
          "quality": "valid"
        }
      ]
    }
  }
}
```

Continuous streams omit the outer `id` and keep `sequence`. Add `id` when you want `{ "accepted": true, "sequence": 1042 }`.

| Rule | Detail |
| --- | --- |
| Identity | `(device_id, sensor_id)`; several sensors per category |
| Time | `sample_time_ms` / `sent_time_ms` are monotonic ms since boot |
| Missing | `value` is `null` with quality `missing` or `invalid` — never zero |
| Numbers | Non-finite values are rejected |
| Temperature | `degC` |
| EMI | `quantity` required; `voltage_rms` is in `V` |

Each publication is a snapshot for that device. Omit a family, or send `value: null` with quality `missing` / `invalid`, and that family is dropped. Missing values are never stored as zero. To keep temperature while EMI is down, send both in the same message.

Publications for the wrong scanner, or while the Twin is in simulation, are rejected. Duplicate or out-of-order `sequence` values on the same `boot_id` are not accepted.

### Actuators (`actuators.set`)

Commands always include `id`. Prefer idempotent operations (`set_enabled`) over toggles.

```json
{
  "jsonrpc": "2.0",
  "id": "adelpha:request-208",
  "method": "actuators.set",
  "params": {
    "protocol_version": "1.0",
    "device_id": "pi-01",
    "command_id": "cooling-command-208",
    "actuator_id": "cooling-01",
    "operation": "set_enabled",
    "arguments": { "enabled": true }
  }
}
```

The device answers `accepted`, persists `command_id` before touching hardware, then notifies `actuators.status` with `completed` and `applied_state`. That reports controller output, not plant response. Rejection uses JSON-RPC error `-32010`. An acknowledgement timeout means **unknown**; query `actuators.get_status`.

Devices advertise operations and argument JSON Schemas on `device.register`. Messages never execute arbitrary code.

## Python client

```python
import asyncio
import os

from dtam.communication import DeviceClient

client = DeviceClient(
    os.environ["ADELPHA_URL"],
    os.environ["ADELPHA_DEVICE_ID"],
    os.environ["ADELPHA_DEVICE_TOKEN"],
    journal_path="./commands.sqlite3",
)

@client.actuator(
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

async def acquire(device):
    while True:
        await device.publish(
            temperature=[{"sensor_id": 1, "value": 28.4, "unit": "degC", "role": "magnet"}]
        )
        await asyncio.sleep(1)

await client.run(acquire)
```

Checked-in templates:

| File | Use |
| --- | --- |
| `src/dtam/communication/examples/pi_device.py` | Pi application with an actuator journal |
| `src/dtam/communication/examples/arduino_bridge.py` | USB serial → same WebSocket client (`pyserial` on the bridge host only) |

`DeviceClient.run()` reconnects on transport loss. Sensor publications are not replayed. Actuator `command_id`s are journaled so retries do not run twice.

## Twin mapping

With a hardware profile selected, `TwinApiSession.read_batch()` uses connected device readings instead of the simulated adapter.

| Publication | Twin field | Dashboard |
| --- | --- | --- |
| Temperature `role: magnet` | Thermal + \(B_0\) estimate | Magnet temperature plot |
| Temperature `role: room` | `room_temperature_c` | Telemetry only |
| EMI `voltage_rms` | EMI RMS | RMS stamp; no spectrum |
| Custom `rf_noise_floor` / `noise_floor` | RF noise floor | Telemetry RF card |
| Other custom | Batch only | **Raw sensors** |
| `missing` / `invalid` / omitted / stale (>30 s) | Not plotted | “not connected”, “reported missing”, or stale in Notes |

Johnson noise traces are simulation-only. Sample timestamps are reception time minus reported sample age; clocks are not synchronized.

`SystemState.notes` always includes magnet temperature, room temperature, and EMI RMS. RF and custom notes appear only when those families were published.

HTTP used by the GUI: `GET /devices`, `GET /devices/{id}/readings`, `POST /devices/control`, `POST /devices/commands`. See [Twin HTTP API](twin-api.md).
