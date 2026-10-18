"""User-owned USB serial bridge. pyserial is needed only on this bridge host.

Arduino sends one JSON line such as:
{"temperature":[{"sensor_id":1,"value":25.1,"unit":"degC","role":"magnet"}]}
The bridge timestamps receipt; it cannot recover the Arduino's acquisition time.
"""

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
                if not line:
                    continue
                if not line.endswith(b"\n"):
                    # Discard a partial/oversized frame, never publish it as fresh data.
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
