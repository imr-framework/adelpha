import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

console = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(console))

from common import queue as queue_module
from common import runtime
from common import protocols as protocols_module
from common.constants import mri4all_files, mri4all_paths
from common.protocols import (
    Protocol,
    ProtocolSequence,
    delete_protocol,
    duplicate_protocol,
    list_protocols,
    load_protocol,
    rename_protocol,
    save_protocol,
)
from common.types import ExamInformation, ScanTask
from services.api import session as session_module
from services.api.models import SequenceInfo, ValidateResponse
from services.api.session import ConsoleSession


@pytest.fixture(autouse=True)
def temporary_base(monkeypatch, tmp_path):
    monkeypatch.setattr(runtime, "base_path", str(tmp_path))
    return tmp_path


@pytest.fixture
def brain_protocol():
    return Protocol(
        id="brain-screening",
        name="Brain Screening",
        sequences=[
            ProtocolSequence(
                name="Localizer",
                sequence="se_2D",
                parameters={"timing": {"TE": 20, "TR": 1000}},
            ),
            ProtocolSequence(
                name="T2 Repeat",
                sequence="se_2D",
                parameters={"timing": {"TE": 70, "TR": 2500}},
            ),
        ],
    )


@pytest.fixture
def console_session():
    return ConsoleSession()


def test_save_load_and_list_ordered_protocols(temporary_base, brain_protocol):
    assert list_protocols() == []
    assert load_protocol("missing") is None

    save_protocol(brain_protocol)

    assert load_protocol(brain_protocol.id) == brain_protocol
    assert list_protocols() == [brain_protocol]
    assert [item.name for item in brain_protocol.sequences] == [
        "Localizer",
        "T2 Repeat",
    ]
    assert (temporary_base / "data" / "state" / "protocols.json").is_file()


def test_load_protocol_migrates_single_sequence_json(temporary_base):
    path = temporary_base / "data" / "state" / "protocols.json"
    path.parent.mkdir(parents=True)
    path.write_text(
        json.dumps(
            [
                {
                    "id": "legacy",
                    "name": "Legacy T2",
                    "sequence": "tse_2D",
                    "parameters": {"TE": 70, "TR": 2500},
                }
            ]
        )
    )

    protocol = load_protocol("legacy")

    assert protocol is not None
    assert protocol.sequences == [
        ProtocolSequence(
            name="Legacy T2",
            sequence="tse_2D",
            parameters={"TE": 70, "TR": 2500},
        )
    ]


def test_save_protocol_rejects_duplicate_id(brain_protocol):
    save_protocol(brain_protocol)
    replacement = brain_protocol.model_copy(
        update={"name": "Replacement"}, deep=True
    )

    with pytest.raises(ValueError, match="already exists"):
        save_protocol(replacement)

    assert load_protocol(brain_protocol.id) == brain_protocol


@pytest.mark.parametrize(
    "values",
    [
        {"id": "empty-name", "name": "", "sequences": [{"name": "T2", "sequence": "tse_2D"}]},
        {"id": "blank-name", "name": "   ", "sequences": [{"name": "T2", "sequence": "tse_2D"}]},
        {"id": "empty-sequences", "name": "Empty", "sequences": []},
    ],
    ids=["empty-name", "blank-name", "empty-sequences"],
)
def test_protocol_rejects_invalid_structure(values):
    with pytest.raises(ValueError):
        Protocol.model_validate(values)


def test_rename_protocol_changes_only_selected_name(brain_protocol):
    other = Protocol(
        id="knee",
        name="Knee",
        sequences=[ProtocolSequence(name="Knee SE", sequence="se_2D")],
    )
    save_protocol(brain_protocol)
    save_protocol(other)

    rename_protocol(brain_protocol.id, "Updated Brain Screening")

    renamed = load_protocol(brain_protocol.id)
    assert renamed is not None
    assert renamed.name == "Updated Brain Screening"
    assert renamed.sequences == brain_protocol.sequences
    assert load_protocol(other.id) == other


@pytest.mark.parametrize(
    ("operation", "arguments"),
    [
        (rename_protocol, ("missing", "New Name")),
        (duplicate_protocol, ("missing", "Copy")),
        (delete_protocol, ("missing",)),
    ],
    ids=["rename", "duplicate", "delete"],
)
def test_protocol_mutations_reject_unknown_id(operation, arguments):
    with pytest.raises(ValueError, match="does not exist"):
        operation(*arguments)


def test_duplicate_protocol_copies_repeated_sequences_independently(brain_protocol):
    save_protocol(brain_protocol)

    duplicate = duplicate_protocol(brain_protocol.id, "Brain Copy")

    assert duplicate.id != brain_protocol.id
    assert duplicate.name == "Brain Copy"
    assert duplicate.sequences == brain_protocol.sequences
    duplicate.sequences[0].parameters["timing"]["TE"] = 99
    assert brain_protocol.sequences[0].parameters["timing"]["TE"] == 20
    assert load_protocol(brain_protocol.id) == brain_protocol


def test_delete_protocol_preserves_others_and_can_empty_storage(brain_protocol):
    other = Protocol(
        id="knee",
        name="Knee",
        sequences=[ProtocolSequence(name="Knee SE", sequence="se_2D")],
    )
    save_protocol(brain_protocol)
    save_protocol(other)

    assert delete_protocol(brain_protocol.id) is None
    assert list_protocols() == [other]

    delete_protocol(other.id)
    assert list_protocols() == []


def test_concurrent_protocol_saves_preserve_all_records(monkeypatch):
    original_write = protocols_module._write_protocols
    active_writes = 0
    maximum_active_writes = 0
    counter_lock = threading.Lock()

    def slow_write(protocols):
        nonlocal active_writes, maximum_active_writes
        with counter_lock:
            active_writes += 1
            maximum_active_writes = max(maximum_active_writes, active_writes)
        time.sleep(0.01)
        try:
            original_write(protocols)
        finally:
            with counter_lock:
                active_writes -= 1

    monkeypatch.setattr(protocols_module, "_write_protocols", slow_write)
    protocols = [
        Protocol(
            id=f"protocol-{index}",
            name=f"Protocol {index}",
            sequences=[ProtocolSequence(name="T2", sequence="tse_2D")],
        )
        for index in range(12)
    ]

    with ThreadPoolExecutor(max_workers=6) as executor:
        list(executor.map(save_protocol, protocols))

    assert maximum_active_writes == 1
    assert {protocol.id for protocol in list_protocols()} == {
        protocol.id for protocol in protocols
    }


def test_save_scans_as_protocol_validates_and_preserves_order(
    monkeypatch, console_session
):
    tasks = {
        "scan-1": ScanTask(
            id="scan-1",
            sequence="se_2D",
            protocol_name="Localizer",
            parameters={"timing": {"TE": 20, "TR": 1000}},
        ),
        "scan-2": ScanTask(
            id="scan-2",
            sequence="se_2D",
            protocol_name="T2 Repeat",
            parameters={"timing": {"TE": 70, "TR": 2500}},
        ),
    }
    originals = {key: value.model_copy(deep=True) for key, value in tasks.items()}
    validation_calls = []
    monkeypatch.setattr(console_session, "read_task", tasks.get)

    def validate(sequence, parameters, task):
        validation_calls.append((sequence, parameters, task.id))
        return ValidateResponse(ok=True)

    monkeypatch.setattr(session_module, "validate_parameters", validate)

    protocol = console_session.save_scans_as_protocol(
        ["scan-2", "scan-1"], "Brain Screening"
    )

    assert [item.name for item in protocol.sequences] == ["T2 Repeat", "Localizer"]
    assert [item.sequence for item in protocol.sequences] == ["se_2D", "se_2D"]
    assert validation_calls == [
        ("se_2D", tasks["scan-2"].parameters, "scan-2"),
        ("se_2D", tasks["scan-1"].parameters, "scan-1"),
    ]
    assert load_protocol(protocol.id) == protocol
    assert tasks == originals


def test_save_scans_rejects_invalid_scan_without_saving(monkeypatch, console_session):
    tasks = {
        "valid": ScanTask(id="valid", sequence="se_2D", parameters={"TE": 20, "TR": 1000}),
        "invalid": ScanTask(id="invalid", sequence="se_2D", parameters={"TE": 1000, "TR": 20}),
    }
    monkeypatch.setattr(console_session, "read_task", tasks.get)
    monkeypatch.setattr(
        session_module,
        "validate_parameters",
        lambda sequence, parameters, task: ValidateResponse(
            ok=task.id != "invalid",
            problems=[] if task.id != "invalid" else ["TE cannot be longer than TR"],
        ),
    )

    with pytest.raises(ValueError, match="TE cannot be longer than TR"):
        console_session.save_scans_as_protocol(
            ["valid", "invalid"], "Invalid Protocol"
        )

    assert list_protocols() == []


def test_save_scan_as_protocol_rejects_unknown_scan(monkeypatch, console_session):
    monkeypatch.setattr(console_session, "read_task", lambda scan_id: None)

    with pytest.raises(FileNotFoundError):
        console_session.save_scan_as_protocol("missing", "Missing Scan")

    assert list_protocols() == []


def configure_queue(monkeypatch, temporary_base):
    queue_dir = temporary_base / "acq_queue"
    queue_dir.mkdir()
    monkeypatch.setattr(mri4all_paths, "DATA_QUEUE_ACQ", str(queue_dir))
    monkeypatch.setattr(
        session_module,
        "get_sequence_info",
        lambda sequence_id: SequenceInfo(
            id=sequence_id,
            name=sequence_id,
            defaults={"TE": 5, "TR": 100},
        )
        if sequence_id in {"se_2D", "tse_2D"}
        else None,
    )
    monkeypatch.setattr(
        session_module,
        "validate_parameters",
        lambda sequence, parameters, task: ValidateResponse(ok=True),
    )
    return queue_dir


def test_insert_protocol_creates_ordered_pending_scans(
    monkeypatch, temporary_base, console_session
):
    queue_dir = configure_queue(monkeypatch, temporary_base)
    console_session.exam = ExamInformation(id="exam-001")
    protocol = Protocol(
        id="brain",
        name="Brain",
        sequences=[
            ProtocolSequence(name="Localizer", sequence="se_2D", parameters={"TE": 20}),
            ProtocolSequence(name="T2", sequence="tse_2D", parameters={"TE": 70}),
        ],
    )
    original = protocol.model_copy(deep=True)
    save_protocol(protocol)

    entries = console_session.insert_protocol(protocol.id, "exam-001")

    assert [entry.protocol_name for entry in entries] == ["Localizer", "T2"]
    assert [entry.sequence for entry in entries] == ["se_2D", "tse_2D"]
    assert [entry.scan_counter for entry in entries] == [1, 2]
    assert len({entry.id for entry in entries}) == 2
    assert [console_session.read_task(entry.id).parameters for entry in entries] == [
        {"TE": 20},
        {"TE": 70},
    ]
    assert all(entry.state == "created" for entry in entries)
    assert all(
        not (queue_dir / entry.folder_name / mri4all_files.PREPARED).exists()
        for entry in entries
    )
    assert load_protocol(protocol.id) == original


def test_failed_protocol_insertion_removes_created_scans(
    monkeypatch, temporary_base, console_session
):
    queue_dir = configure_queue(monkeypatch, temporary_base)
    console_session.exam = ExamInformation(id="exam-001")
    protocol = Protocol(
        id="brain",
        name="Brain",
        sequences=[
            ProtocolSequence(name="Localizer", sequence="se_2D"),
            ProtocolSequence(name="T2", sequence="tse_2D"),
        ],
    )
    save_protocol(protocol)
    original_write = console_session.write_task
    writes = 0

    def fail_second_write(scan_id, scan_task):
        nonlocal writes
        writes += 1
        if writes == 2:
            return False
        return original_write(scan_id, scan_task)

    monkeypatch.setattr(console_session, "write_task", fail_second_write)

    with pytest.raises(RuntimeError, match="Failed to update inserted scan"):
        console_session.insert_protocol(protocol.id, "exam-001")

    assert console_session.queue == []
    assert list(queue_dir.iterdir()) == []


def test_run_protocol_prepares_all_scans_for_existing_pipeline(
    monkeypatch, temporary_base, console_session
):
    queue_dir = configure_queue(monkeypatch, temporary_base)
    console_session.exam = ExamInformation(id="exam-001")
    protocol = Protocol(
        id="brain",
        name="Brain",
        sequences=[
            ProtocolSequence(name="First", sequence="se_2D"),
            ProtocolSequence(name="Second", sequence="tse_2D"),
        ],
    )
    save_protocol(protocol)

    entries = console_session.insert_protocol(
        protocol.id, "exam-001", prepared=True
    )

    assert [entry.state for entry in entries] == ["scheduled_acq", "scheduled_acq"]
    assert all(
        (queue_dir / entry.folder_name / mri4all_files.PREPARED).exists()
        for entry in entries
    )
    assert queue_module.get_scan_ready_for_acq() == entries[0].folder_name


def test_run_protocol_surfaces_preparation_failure(
    monkeypatch, temporary_base, console_session
):
    configure_queue(monkeypatch, temporary_base)
    console_session.exam = ExamInformation(id="exam-001")
    protocol = Protocol(
        id="brain",
        name="Brain",
        sequences=[ProtocolSequence(name="Localizer", sequence="se_2D")],
    )
    save_protocol(protocol)
    original_set_state = session_module.task.set_task_state

    def fail_prepared(folder, state, value):
        if state == mri4all_files.PREPARED and value:
            return False
        return original_set_state(folder, state, value)

    monkeypatch.setattr(session_module.task, "set_task_state", fail_prepared)

    with pytest.raises(RuntimeError, match="Failed to prepare scan"):
        console_session.insert_protocol(protocol.id, "exam-001", prepared=True)


def test_acquisition_queue_uses_scan_number_not_timestamp(monkeypatch, tmp_path):
    queue_dir = tmp_path / "deterministic_queue"
    queue_dir.mkdir()
    monkeypatch.setattr(mri4all_paths, "DATA_QUEUE_ACQ", str(queue_dir))
    later_scan = queue_dir / "exam#scan_10"
    earlier_scan = queue_dir / "exam#scan_2"
    later_scan.mkdir()
    earlier_scan.mkdir()
    (later_scan / mri4all_files.PREPARED).touch()
    (earlier_scan / mri4all_files.PREPARED).touch()
    os.utime(later_scan, (1, 1))
    os.utime(earlier_scan, (2, 2))

    assert queue_module.get_scan_ready_for_acq() == earlier_scan.name


@pytest.mark.parametrize("missing", ["protocol", "exam"])
def test_insert_protocol_rejects_missing_resources(
    missing, console_session, brain_protocol
):
    if missing == "protocol":
        console_session.exam = ExamInformation(id="exam-001")
        protocol_id = "missing"
    else:
        save_protocol(brain_protocol)
        protocol_id = brain_protocol.id

    with pytest.raises(FileNotFoundError):
        console_session.insert_protocol(protocol_id, "exam-001")

    assert console_session.queue == []
