# Adelpha device protocol v1

Operator setup and example scripts: Adelpha `docs/guide/devices.md`. Published protocol page: `dtam/docs/platform/devices.md`.

One JSON-RPC 2.0 envelope for two message families: **sensor readings** (`sensors.publish`) and **actuator commands** (`actuators.set`). Structure is validated by `adelpha-device-v1.schema.json`. This document defines timing, acknowledgements, quality, and feedback-operation behaviour.

The Raspberry Pi connects to Adelpha as a WebSocket client. An Arduino does **not** open a serial session to Adelpha. A user Python process owns the serial link and uses `from adelpha import telemetry` (`telemetry.DeviceClient`) to reach the platform. Actuator handlers use `from adelpha import feedback`.

## Transports

| Connection | Framing |
| --- | --- |
| Raspberry Pi ↔ Adelpha | One JSON-RPC object per WebSocket text frame at `ws[s]://PC:PORT/ws/{device_id}` |
| Arduino ↔ user Python | User-defined serial; the same `DeviceClient` then talks WebSocket to Adelpha |

Bearer tokens go in the `Authorization` header, never in the URL. Maximum message size is 64 KiB. Batches are at most 32 objects.

## JSON-RPC identity

- Include `id` (string or integer, not float) when a response is required. Adelpha echoes that `id`.
- Omit `id` for a notification. Notifications must not receive a response.
- Do not send a separate `requires_response` flag.

## Sensor readings: device → Adelpha

Method: `sensors.publish`. Continuous streams omit `id`. Keep `sequence` to detect gaps and duplicates. `sample_time_ms` and `sent_time_ms` are monotonic milliseconds since device boot. Adelpha records reception time; cross-device sync needs a separate clock offset.

Identify a sensor as `(device_id, sensor_id)`. Arrays under `temperature`, `emi`, and `custom` allow several sensors per category.

| Field | Rule |
| --- | --- |
| `value` | JSON number or `null`. Non-finite numbers are rejected. Missing data is `null`, never zero. |
| `quality` | `valid`, `suspect`, `invalid`, or `missing`. Null values must be `missing` or `invalid`. |
| `quantity` / `unit` | Required for EMI and custom. Temperature is `degC`. `voltage_rms` is in `V`. |
| `dashboard_id` | Optional. Adelpha may map it; devices need not know the UI layout. |
| `boot_id` | New value after a device restart so sequences can restart at 1. |

A request with `id` is acknowledged `{ "accepted": true, "sequence": N }`. Duplicate or out-of-order `sequence` values on the same boot are not accepted. Publications are dropped in simulation mode and when the Twin is not on the device’s assigned scanner.

Each publication replaces the previous snapshot for that device. Omit a family, or send `value: null` with quality `missing` or `invalid`, and that family is not plotted and not stored as zero. To keep one sensor while another is down, include both in the same snapshot. Readings older than 30 seconds are stale. Twin notes report each family as received, not connected, reported missing, invalid, or stale. `voltage_rms` maps to EMI RMS only; spectrum arrays are not part of this protocol.

## Actuator commands: Adelpha → device

Commands always include `id`. Prefer idempotent operations such as `set_enabled` over toggles so a retry cannot invert the output.

1. Adelpha sends `actuators.set` with `command_id`.
2. The device responds `status: accepted` (or a JSON-RPC error).
3. When the controller output is applied, the device notifies `actuators.status` with `completed` and `applied_state`. That does not prove the physical plant responded; sensor readings close the loop.
4. Rejection uses error code `-32010` with a `reason` such as `local_interlock_active`.

Rules:

- Devices advertise actuators, operations, and argument JSON Schemas through `device.register` / `device.describe`.
- `command_id` deduplicates retries. The client journal must persist an accepted command before invoking hardware.
- An acknowledgement timeout means **unknown**, not failed. Query `actuators.get_status`.
- Adelpha read-only / simulation modes reject physical commands. `allow_control` in `devices.json` and an explicit control enablement are both required.
- Device-local limits, interlocks, and disconnect fallbacks remain authoritative. Cooling must not universally turn off on connection loss.
- Messages name operations such as `set_enabled` or `set_target`. They do not execute arbitrary code.

## Configuring Adelpha

Copy `devices.example.json` to the Adelpha config directory as `devices.json` (or set `ADELPHA_DEVICE_CONFIG`). Bind `host` to `0.0.0.0` so a Pi on Ethernet can connect. Tokens must be unique, random, and at least 24 characters. Restart the Twin after changing the file.

```python
from adelpha import telemetry

client = telemetry.connect(os.environ["ADELPHA_URL"], os.environ["ADELPHA_DEVICE_ID"], os.environ["ADELPHA_DEVICE_TOKEN"])
await client.run(acquire)
```

See `examples/pi_device.py` and `examples/arduino_bridge.py`.
