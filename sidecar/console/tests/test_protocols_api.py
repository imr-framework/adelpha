import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

console = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(console))

from common import runtime
from common.protocols import Protocol, ProtocolSequence, load_protocol, save_protocol
from common.types import ExamInformation, ScanQueueEntry
from services.api.app import app
from services.api.session import session


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(runtime, "base_path", str(tmp_path))
    return TestClient(app)


@pytest.fixture
def brain_protocol():
    return Protocol(
        id="brain",
        name="Brain Screening",
        sequences=[
            ProtocolSequence(name="Localizer", sequence="se_2D", parameters={"TE": 20}),
            ProtocolSequence(name="T2", sequence="tse_2D", parameters={"TE": 70}),
        ],
    )


def test_list_and_get_protocols(client, brain_protocol):
    save_protocol(brain_protocol)

    response = client.get("/protocols")

    assert response.status_code == 200
    assert response.json() == [brain_protocol.model_dump()]
    assert client.get("/protocols/brain").json() == brain_protocol.model_dump()
    assert client.get("/protocols/missing").status_code == 404


def test_create_protocol_from_ordered_scans(client, monkeypatch, brain_protocol):
    calls = []

    def save_scans(scan_ids, name):
        calls.append((scan_ids, name))
        return brain_protocol

    monkeypatch.setattr(session, "save_scans_as_protocol", save_scans)

    response = client.post(
        "/protocols",
        json={"name": "Brain Screening", "scan_ids": ["scan-2", "scan-1"]},
    )

    assert response.status_code == 200
    assert response.json() == brain_protocol.model_dump()
    assert calls == [(["scan-2", "scan-1"], "Brain Screening")]


def test_save_single_scan_as_protocol_endpoint(client, monkeypatch, brain_protocol):
    calls = []

    def save_scan(scan_id, name):
        calls.append((scan_id, name))
        return brain_protocol

    monkeypatch.setattr(session, "save_scan_as_protocol", save_scan)

    response = client.post(
        "/scans/scan-001/protocol", json={"name": "Brain Screening"}
    )

    assert response.status_code == 200
    assert calls == [("scan-001", "Brain Screening")]


@pytest.mark.parametrize(
    ("path", "body", "error", "expected_status"),
    [
        ("/protocols", {"name": "Missing", "scan_ids": ["missing"]}, FileNotFoundError(), 404),
        ("/protocols", {"name": "Invalid", "scan_ids": ["bad"]}, ValueError("Invalid parameters"), 400),
        ("/scans/missing/protocol", {"name": "Missing"}, FileNotFoundError(), 404),
        ("/scans/bad/protocol", {"name": "Invalid"}, ValueError("Invalid parameters"), 400),
    ],
    ids=["multi-missing", "multi-invalid", "single-missing", "single-invalid"],
)
def test_save_protocol_errors(client, monkeypatch, path, body, error, expected_status):
    def fail(*args):
        raise error

    if path == "/protocols":
        monkeypatch.setattr(session, "save_scans_as_protocol", fail)
    else:
        monkeypatch.setattr(session, "save_scan_as_protocol", fail)

    response = client.post(path, json=body)

    assert response.status_code == expected_status


def test_rename_duplicate_and_delete_protocol(client, brain_protocol):
    save_protocol(brain_protocol)

    renamed = client.patch("/protocols/brain", json={"name": "Updated Brain"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Updated Brain"

    duplicated = client.post(
        "/protocols/brain/duplicate", json={"name": "Brain Copy"}
    )
    assert duplicated.status_code == 200
    duplicate = duplicated.json()
    assert duplicate["id"] != brain_protocol.id
    assert duplicate["sequences"] == brain_protocol.model_dump()["sequences"]

    deleted = client.delete("/protocols/brain")
    assert deleted.status_code == 200
    assert load_protocol("brain") is None
    assert load_protocol(duplicate["id"]) is not None


@pytest.mark.parametrize(
    ("method", "path", "body", "expected_status"),
    [
        ("PATCH", "/protocols/missing", {"name": "New"}, 404),
        ("POST", "/protocols/missing/duplicate", {"name": "Copy"}, 404),
        ("DELETE", "/protocols/missing", None, 404),
        ("PATCH", "/protocols/missing", {"name": ""}, 422),
        ("POST", "/protocols", {"name": "   ", "scan_ids": ["scan-1"]}, 422),
    ],
    ids=["rename-missing", "duplicate-missing", "delete-missing", "empty-name", "blank-name"],
)
def test_protocol_mutation_errors(client, method, path, body, expected_status):
    response = client.request(method, path, json=body)

    assert response.status_code == expected_status


@pytest.mark.parametrize(
    ("path", "prepared"),
    [("insert", False), ("run", True)],
)
def test_insert_and_run_protocol_endpoint(
    client, monkeypatch, brain_protocol, path, prepared
):
    save_protocol(brain_protocol)
    monkeypatch.setattr(session, "exam", ExamInformation(id="exam-001"))
    entries = [
        ScanQueueEntry(id="scan-1", sequence="se_2D", protocol_name="Localizer"),
        ScanQueueEntry(id="scan-2", sequence="tse_2D", protocol_name="T2"),
    ]
    calls = []

    def insert(protocol_id, exam_id, prepared=False):
        calls.append((protocol_id, exam_id, prepared))
        return entries

    monkeypatch.setattr(session, "insert_protocol", insert)

    response = client.post(
        f"/protocols/brain/{path}",
        json={"exam_id": "exam-001"},
    )

    assert response.status_code == 200
    assert [entry["id"] for entry in response.json()] == ["scan-1", "scan-2"]
    assert calls == [("brain", "exam-001", prepared)]


def test_insert_protocol_endpoint_handles_missing_resources(
    client, monkeypatch, brain_protocol
):
    monkeypatch.setattr(session, "exam", ExamInformation(id="exam-001"))
    response = client.post(
        "/protocols/missing/insert", json={"exam_id": "exam-001"}
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Protocol not found"

    save_protocol(brain_protocol)
    response = client.post(
        "/protocols/brain/insert", json={"exam_id": "other-exam"}
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Exam not found"
