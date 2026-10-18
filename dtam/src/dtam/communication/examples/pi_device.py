"""User application template: implement the functions in your hardware.py."""

import asyncio
import os

from hardware import read_temperature, set_cooling_and_verify

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
    # This function should enforce device-local interlocks and verify the output.
    actual_enabled = await asyncio.to_thread(set_cooling_and_verify, enabled)
    if actual_enabled != enabled:
        raise RuntimeError("Cooling output did not reach the requested state")
    return {"enabled": actual_enabled}


async def acquire(device):
    while True:
        temperature = await asyncio.to_thread(read_temperature)
        await device.publish(
            temperature=[
                {
                    "sensor_id": 1,
                    "value": temperature,
                    "unit": "degC",
                    "role": "magnet",
                    "quality": "valid" if temperature is not None else "missing",
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
