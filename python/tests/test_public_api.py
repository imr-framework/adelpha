"""Public Adelpha imports: telemetry, feedback, and engineering modules."""

from __future__ import annotations

import inspect

import pytest


def test_import_telemetry_and_feedback_from_adelpha():
    from adelpha import feedback, telemetry

    assert telemetry.DeviceClient is feedback.DeviceClient
    assert callable(telemetry.connect)
    assert callable(telemetry.publish)
    assert callable(feedback.register)
    assert inspect.iscoroutinefunction(telemetry.publish)


def test_connect_builds_client():
    from adelpha.telemetry import DeviceClient, connect

    client = connect("ws://127.0.0.1:8765/ws/pi-01", "pi-01", "token-at-least-24-chars!!")
    assert isinstance(client, DeviceClient)
    assert client.device_id == "pi-01"


def test_feedback_register_requires_journal():
    from adelpha import feedback, telemetry

    client = telemetry.connect("ws://127.0.0.1:8765/ws/pi-01", "pi-01", "token-at-least-24-chars!!")
    with pytest.raises(ValueError, match="journal_path"):

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


def test_magnet_design_defaults():
    from adelpha import magnet

    result = magnet.design()
    assert result["ok"] is True
    assert result["cubes"]
    assert result["magnets"] == magnet.DEFAULTS["magnets"]
    assert result["rings"] == magnet.DEFAULTS["rings"]


def test_coil_and_rfcoil_and_shim_requests():
    from adelpha import coil, rfcoil, shim

    assert coil.coil_request(None)["axis"] == "y"
    assert rfcoil.rfcoil_request(None)["freq_mhz"] == pytest.approx(10.64)
    request = shim.shim_request(None)
    assert request["top_mm"] > request["bottom_mm"]


def test_fem_and_domain_exports():
    from adelpha import domain, fem

    config = fem.SimulationConfig(
        "magnet.step",
        {"pm": fem.Material(remanence=(0.0, 0.0, 1.0))},
        (fem.Region("magnet", (1,), "pm"),),
    )
    assert config.regions[0].solids == (1,)
    assert domain.QuantityKind.TEMPERATURE


def test_twin_and_scanners_import():
    from adelpha import scanners, twin

    assert twin.ThermalMagneticTwin is not None
    assert callable(scanners.create_scanner_adapter)


def test_version_and_lazy_public_names():
    import adelpha

    assert adelpha.__version__ == "0.1.0"
    assert "telemetry" in adelpha.__all__
    assert "feedback" in adelpha.__all__


def test_telemetry_publish_payload_and_feedback_command():
    from adelpha.feedback import Command
    from adelpha.telemetry import Publish

    payload = Publish.model_validate(
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
                        "value": 25,
                        "unit": "degC",
                        "role": "magnet",
                    }
                ]
            },
        }
    )
    assert payload.sensors.temperature[0].value == 25

    command = Command.model_validate(
        {
            "device_id": "pi-01",
            "command_id": "cmd-1",
            "actuator_id": "cooling-01",
            "operation": "set_enabled",
            "arguments": {"enabled": True},
        }
    )
    assert command.operation == "set_enabled"
