import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from websockets.asyncio.client import connect
from websockets.exceptions import InvalidStatus

from dtam.api.session import TwinApiSession
from dtam.communication import DeviceClient
from dtam.communication.protocol import Command, RpcError
from dtam.communication.server import DeviceHub, ListenerConfig, device_listener
from dtam.domain.modes import OperationalMode

TOKEN = "a-test-token-with-at-least-24-characters"


def setup_hub(config_root):
    session = TwinApiSession.create(scanner_id="halbach_48mt", config_root=config_root)
    config = ListenerConfig(
        port=0,
        allow_control=True,
        devices={
            "pi-01": {
                "token": TOKEN,
                "scanner_id": "halbach_48mt",
                "allowed_actuators": {"cooling-01": ["set_enabled"]},
            }
        },
    )
    hub = DeviceHub(session, config)
    session.device_hub = hub
    return session, hub


@pytest.mark.asyncio
async def test_real_tcp_websocket_publish_control_and_reconnect(config_root, tmp_path):
    session, hub = setup_hub(config_root)
    async with device_listener(hub) as port:
        url = f"ws://127.0.0.1:{port}/ws/pi-01"
        with pytest.raises(InvalidStatus):
            async with connect(
                url, additional_headers={"Authorization": "Bearer wrong"}
            ):
                pass
        client = DeviceClient(
            url, "pi-01", TOKEN, journal_path=tmp_path / "commands.db"
        )
        calls = []

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
            calls.append(enabled)
            return {"enabled": enabled}

        command = Command(
            device_id="pi-01",
            command_id="cmd-1",
            actuator_id="cooling-01",
            operation="set_enabled",
            arguments={"enabled": True},
        )
        async with client.connection():
            assert session.connected
            result = await client.publish(
                temperature=[
                    {"sensor_id": 1, "value": 26, "unit": "degC", "role": "magnet"}
                ],
                emi=[
                    {
                        "sensor_id": 2,
                        "value": 0.01,
                        "unit": "V",
                        "quantity": "voltage_rms",
                    }
                ],
                acknowledge=True,
            )
            assert result["accepted"]
            state = session.update_twin()
            assert state.thermal.mean_magnet_temperature_c.value == 26
            assert state.emi.rms_v.value == 0.01
            with pytest.raises(RpcError):
                await hub.command(command)
            session._app.adapter.set_mode(OperationalMode.SUPERVISED_CONTROL)
            hub.control_scanner = session.scanner_id
            await hub.command(command)
            for _ in range(50):
                status = await hub.query_command("pi-01", "cmd-1")
                if status["status"] == "completed":
                    break
                await asyncio.sleep(0.01)
            assert status["status"] == "completed"
            await hub.command(command)
            assert calls == [True]
            await client.publish(
                temperature=[
                    {
                        "sensor_id": 1,
                        "value": None,
                        "unit": "degC",
                        "quality": "missing",
                    }
                ],
                acknowledge=True,
            )
            assert session.update_twin().thermal is None
        await asyncio.sleep(0.05)
        assert not session.connected and not session.read_batch().measurements
        async with client.connection():
            # Retry the same command after losing the server's in-memory cache.
            hub.commands.clear()
            assert (await hub.command(command))["status"] == "completed"
            assert calls == [True]
            assert (
                await client.publish(
                    emi=[
                        {
                            "sensor_id": 2,
                            "value": 0.02,
                            "unit": "V",
                            "quantity": "voltage_rms",
                        }
                    ],
                    acknowledge=True,
                )
            )["accepted"]
            assert session.update_twin().thermal is None
            assert session.update_twin().emi.rms_v.value == 0.02
            payload, _ = hub.readings["pi-01"]
            hub.readings["pi-01"] = (
                payload,
                datetime.now(timezone.utc) - timedelta(seconds=31),
            )
            assert not session.read_batch().measurements
            session.reconfigure(
                scanner_id="simulated_scanner",
                environment="development",
                config_root=config_root,
            )
            assert hub.control_scanner is None
            with pytest.raises(RpcError):
                await client.publish(acknowledge=True)
        await client.close()
    session.close()


def test_partial_publication_maps_to_twin_without_inventing_values(config_root):
    from dtam.communication.protocol import Publish, Registration

    session, hub = setup_hub(config_root)
    hub.registrations["pi-01"] = Registration(device_id="pi-01", boot_id="boot-1")
    hub.readings["pi-01"] = (
        Publish.model_validate(
            {
                "device_id": "pi-01",
                "boot_id": "boot-1",
                "sequence": 1,
                "sent_time_ms": 100,
                "sensors": {
                    "temperature": [
                        {
                            "sensor_id": 1,
                            "sample_time_ms": 100,
                            "value": 26.5,
                            "unit": "degC",
                            "role": "magnet",
                        }
                    ],
                    "emi": [
                        {
                            "sensor_id": 2,
                            "sample_time_ms": 100,
                            "value": None,
                            "unit": "V",
                            "quantity": "voltage_rms",
                            "quality": "missing",
                        }
                    ],
                },
            }
        ),
        datetime.now(timezone.utc),
    )
    state = session.update_twin()
    assert state.thermal is not None
    assert state.thermal.mean_magnet_temperature_c.value == 26.5
    assert state.emi is None
    assert "Magnet temperature received." in state.notes
    assert "EMI RMS reported missing." in state.notes
    assert "Room temperature not connected." in state.notes
    batch = session.read_batch()
    assert len(batch.measurements) == 1
    assert batch.measurements[0].value == 26.5
    session.close()
