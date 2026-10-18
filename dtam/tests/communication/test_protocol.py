import json

import pytest
from pydantic import ValidationError

from dtam.communication.protocol import Publish, RpcError, decode
from dtam.communication.rpc import Peer


def publication(**changes):
    return dict(
        device_id="pi-01",
        boot_id="boot-1",
        sequence=1,
        sent_time_ms=100,
        sensors={
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
        **changes,
    )


def test_emi_requires_quantity_but_not_only_voltage_rms():
    data = publication()
    data["sensors"] = {
        "emi": [
            {
                "sensor_id": 2,
                "sample_time_ms": 100,
                "value": 1.2e-6,
                "unit": "T",
                "quantity": "field_strength",
                "quality": "valid",
            }
        ]
    }
    assert Publish.model_validate(data).sensors.emi[0].quantity == "field_strength"
    data["sensors"]["emi"][0]["quantity"] = None
    with pytest.raises(ValidationError):
        Publish.model_validate(data)


def test_listener_config_reads_devices_json(tmp_path, monkeypatch):
    from dtam.communication.server import ListenerConfig

    path = tmp_path / "devices.json"
    path.write_text(
        '{"host":"0.0.0.0","port":8765,"allow_control":false,"devices":{"pi-01":{"token":"a-test-token-with-at-least-24-characters","scanner_id":"halbach_48mt"}}}'
    )
    monkeypatch.setenv("ADELPHA_CONFIG_DIR", str(tmp_path))
    monkeypatch.delenv("ADELPHA_DEVICE_CONFIG", raising=False)
    config = ListenerConfig.from_environment()
    assert config is not None
    assert config.host == "0.0.0.0"
    assert "pi-01" in config.devices


def test_reading_validation():
    assert Publish.model_validate(publication()).sensors.temperature[0].value == 25
    for value in (float("nan"), float("inf"), None):
        data = publication()
        data["sensors"]["temperature"][0]["value"] = value
        with pytest.raises(ValidationError):
            Publish.model_validate(data)
    data["sensors"]["temperature"][0]["quality"] = "missing"
    assert Publish.model_validate(data).sensors.temperature[0].value is None
    data["sequence"] = 1.5
    with pytest.raises(ValidationError):
        Publish.model_validate(data)


@pytest.mark.asyncio
async def test_rpc_notifications_errors_and_batches():
    sent = []

    async def send(raw):
        sent.append(json.loads(raw))

    async def dispatch(method, params, has_id):
        if method == "fail":
            raise RpcError(-32601, "Method not found")
        return params

    peer = Peer(send, dispatch)
    await peer.receive("{")
    assert sent.pop()["error"]["code"] == -32700
    await peer.receive(
        json.dumps(
            [
                {"jsonrpc": "2.0", "method": "ok", "params": {"a": 1}},
                {"jsonrpc": "2.0", "id": "x", "method": "fail"},
            ]
        )
    )
    assert sent.pop() == [
        {
            "jsonrpc": "2.0",
            "id": "x",
            "error": {"code": -32601, "message": "Method not found"},
        }
    ]
    await peer.receive('{"jsonrpc":"2.0","method":"fail"}')
    assert not sent
    await peer.receive("[]")
    assert sent.pop()["error"]["code"] == -32600
    with pytest.raises(RpcError):
        decode('{"x":NaN}')
