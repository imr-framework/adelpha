"""Exam/scan session on top of the MRI4ALL folder queue."""

from __future__ import annotations

import os
from copy import deepcopy
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import common.helper as helper
import common.queue as queue
import common.task as task
from common.constants import mri4all_files, mri4all_paths, mri4all_states
from common.protocols import Protocol, ProtocolSequence, load_protocol, save_protocol
from common.types import (
    ExamInformation,
    PatientInformation,
    ScanQueueEntry,
    ScanStatesType,
    ScanTask,
    SystemInformation,
)
from services.api.models import ValidateResponse
from services.api.sequences_api import get_sequence_info, validate_parameters

STATE_DIRS: List[Tuple[str, str]] = [
    (mri4all_paths.DATA_QUEUE_ACQ, ""),
    (mri4all_paths.DATA_ACQ, mri4all_states.ACQ),
    (mri4all_paths.DATA_QUEUE_RECON, mri4all_states.SCHEDULED_RECON),
    (mri4all_paths.DATA_RECON, mri4all_states.RECON),
    (mri4all_paths.DATA_COMPLETE, mri4all_states.COMPLETE),
    (mri4all_paths.DATA_FAILURE, mri4all_states.FAILURE),
]


class ConsoleSession:
    def __init__(self) -> None:
        self.patient = PatientInformation()
        self.exam = ExamInformation()
        self.system = SystemInformation(
            name="Adelpha",
            model="Halbach",
            software_version="0.1.0",
        )
        self.queue: List[ScanQueueEntry] = []

    def exam_active(self) -> bool:
        return bool(self.exam.id)

    def start_exam(self, patient: PatientInformation, acc: str, position: str) -> None:
        queue.check_and_create_folders()
        queue.clear_folders()
        self.patient = patient
        self.exam = ExamInformation()
        self.exam.initialize()
        self.exam.acc = acc
        self.exam.patient_position = position
        self.queue = []

    def end_exam(self) -> None:
        self.patient.clear()
        self.exam.clear()
        self.queue = []
        queue.clear_folders()

    def create_scan(self, sequence: str, protocol_name: str = "") -> ScanQueueEntry:
        if not self.exam_active():
            raise RuntimeError("No active exam")
        info = get_sequence_info(sequence)
        if info is None:
            raise ValueError(f"Unknown sequence {sequence}")
        name = protocol_name or info.name
        self.exam.scan_counter += 1
        scan_uid = helper.generate_uid()
        folder = task.create_task(
            self.exam.id,
            scan_uid,
            self.exam.scan_counter,
            sequence,
            self.patient,
            info.defaults,
            name,
            self.system,
            self.exam,
        )
        if not folder:
            raise RuntimeError("Failed to create scan task folder")
        entry = ScanQueueEntry(
            id=scan_uid,
            sequence=sequence,
            protocol_name=name,
            scan_counter=self.exam.scan_counter,
            state="created",
            has_results=False,
            folder_name=folder,
            description=info.description,
        )
        self.queue.append(entry)
        self.refresh_queue()
        return next(e for e in self.queue if e.id == scan_uid)

    def refresh_queue(self) -> List[ScanQueueEntry]:
        updated: List[ScanQueueEntry] = []
        for entry in self.queue:
            folder = entry.folder_name
            state = self._state_for_folder(folder)
            if not state:
                continue
            entry.state = state  # type: ignore[assignment]
            if state == mri4all_states.COMPLETE:
                loc = os.path.join(mri4all_paths.DATA_COMPLETE, entry.folder_name)
                if os.path.isdir(loc):
                    scan = task.read_task(loc)
                    if scan and getattr(scan, "results", None):
                        entry.has_results = len(scan.results) > 0
            updated.append(entry)
        self.queue = updated
        return self.queue

    def _state_for_folder(self, folder: str) -> str:
        acq_q = Path(mri4all_paths.DATA_QUEUE_ACQ) / folder
        if acq_q.is_dir():
            if (acq_q / mri4all_files.PREPARED).is_file():
                return mri4all_states.SCHEDULED_ACQ
            return mri4all_states.CREATED
        if (Path(mri4all_paths.DATA_ACQ) / folder).is_dir():
            return mri4all_states.ACQ
        if (Path(mri4all_paths.DATA_QUEUE_RECON) / folder).is_dir():
            return mri4all_states.SCHEDULED_RECON
        if (Path(mri4all_paths.DATA_RECON) / folder).is_dir():
            return mri4all_states.RECON
        if (Path(mri4all_paths.DATA_COMPLETE) / folder).is_dir():
            return mri4all_states.COMPLETE
        if (Path(mri4all_paths.DATA_FAILURE) / folder).is_dir():
            return mri4all_states.FAILURE
        return ""

    def find_folder(self, scan_id: str) -> Optional[str]:
        entry = self.get_entry(scan_id)
        if not entry:
            self.refresh_queue()
            entry = self.get_entry(scan_id)
        if not entry:
            return None
        mapping: Dict[ScanStatesType, str] = {
            "created": mri4all_paths.DATA_QUEUE_ACQ,
            "scheduled_acq": mri4all_paths.DATA_QUEUE_ACQ,
            "acq": mri4all_paths.DATA_ACQ,
            "scheduled_recon": mri4all_paths.DATA_QUEUE_RECON,
            "recon": mri4all_paths.DATA_RECON,
            "complete": mri4all_paths.DATA_COMPLETE,
            "failure": mri4all_paths.DATA_FAILURE,
        }
        root = mapping.get(entry.state)  # type: ignore[arg-type]
        if not root:
            return None
        path = os.path.join(root, entry.folder_name)
        return path if os.path.isdir(path) else None

    def get_entry(self, scan_id: str) -> Optional[ScanQueueEntry]:
        for entry in self.queue:
            if entry.id == scan_id:
                return entry
        return None

    def read_task(self, scan_id: str) -> Optional[ScanTask]:
        folder = self.find_folder(scan_id)
        if not folder:
            return None
        return task.read_task(folder)

    def write_task(self, scan_id: str, scan_task: ScanTask) -> bool:
        folder = self.find_folder(scan_id)
        if not folder:
            return False
        return task.write_task(folder, scan_task)

    def set_prepared(self, scan_id: str, prepared: bool) -> None:
        folder = self.find_folder(scan_id)
        if not folder:
            raise FileNotFoundError(scan_id)
        if prepared:
            self._snapshot_hardware(scan_id)
            if not task.set_task_state(folder, mri4all_files.EDITING, False):
                raise RuntimeError("Failed to finish editing scan")
            if not task.set_task_state(folder, mri4all_files.PREPARED, True):
                raise RuntimeError("Failed to prepare scan")
        else:
            if not task.set_task_state(folder, mri4all_files.PREPARED, False):
                raise RuntimeError("Failed to unprepare scan")
            if not task.set_task_state(folder, mri4all_files.EDITING, True):
                raise RuntimeError("Failed to edit scan")

    def _snapshot_hardware(self, scan_id: str) -> None:
        scan_task = self.read_task(scan_id)
        if scan_task is None:
            return
        try:
            import common.config as config
            from sequences.common.util import reading_json_parameter

            acq = reading_json_parameter()
            op = config.get_config()
            scan_task.adjustment.rf.larmor_frequency = acq.rf_parameters.larmor_frequency_MHz
            scan_task.adjustment.rf.rf_max_amplitude = acq.rf_parameters.rf_maximum_amplitude_Hze
            scan_task.adjustment.rf.rf_pi2_fraction = acq.rf_parameters.rf_pi2_fraction
            scan_task.adjustment.shim.shim_x = acq.shim_parameters.shim_x
            scan_task.adjustment.shim.shim_y = acq.shim_parameters.shim_y
            scan_task.adjustment.shim.shim_z = acq.shim_parameters.shim_z
            scan_task.adjustment.gradients.gx_max = acq.gradients_parameters.gx_maximum
            scan_task.adjustment.gradients.gy_max = acq.gradients_parameters.gy_maximum
            scan_task.adjustment.gradients.gz_max = acq.gradients_parameters.gz_maximum
            extra = dict(scan_task.other or {})
            extra["hardware_simulation"] = op.is_hardware_simulation()
            extra["scanner_ip"] = op.scanner_ip
            extra["gradient_board"] = acq.marcos_parameters.gradient_board_type
            extra["fpga_clock_MHz"] = acq.marcos_parameters.fpga_clock_frequency_MHz
            scan_task.other = extra
            self.write_task(scan_id, scan_task)
        except Exception:
            return

    def halt(self, scan_id: str) -> None:
        folder = self.find_folder(scan_id)
        if not folder:
            raise FileNotFoundError(scan_id)
        task.set_task_state(folder, mri4all_files.PREPARED, False)
        task.set_task_state(folder, mri4all_files.STOP, True)

    def delete_scan(self, scan_id: str) -> None:
        self.refresh_queue()
        entry = self.get_entry(scan_id)
        if not entry:
            raise FileNotFoundError(scan_id)
        if entry.state not in ("created", "scheduled_acq"):
            raise ValueError("Only unacquired scans can be deleted")
        folder = self.find_folder(scan_id)
        if not folder or not task.delete_task(folder):
            raise RuntimeError("Failed to delete scan folder")
        self.queue = [e for e in self.queue if e.id != scan_id]

    def duplicate_scan(self, scan_id: str) -> ScanQueueEntry:
        src = self.read_task(scan_id)
        if src is None:
            raise FileNotFoundError(scan_id)
        entry = self.create_scan(src.sequence, src.protocol_name)
        dest = self.read_task(entry.id)
        if dest is None:
            raise RuntimeError("Failed to duplicate scan")
        dest.parameters = src.parameters
        dest.adjustment = src.adjustment
        dest.processing = src.processing
        dest.other = src.other
        dest.protocol_name = src.protocol_name
        self.write_task(entry.id, dest)
        entry.protocol_name = src.protocol_name
        return entry

    def clone_from_folder(self, folder: str) -> ScanQueueEntry:
        src = task.read_task(folder)
        if src is None:
            raise FileNotFoundError(folder)
        if not self.exam_active():
            raise RuntimeError("No active exam")
        entry = self.create_scan(src.sequence, src.protocol_name)
        dest = self.read_task(entry.id)
        if dest is None:
            raise RuntimeError("Failed to clone scan")
        dest.parameters = src.parameters
        dest.adjustment = src.adjustment
        dest.processing = src.processing
        dest.other = src.other
        dest.protocol_name = src.protocol_name
        self.write_task(entry.id, dest)
        entry.protocol_name = src.protocol_name
        return entry

    def rename_scan(self, scan_id: str, protocol_name: str) -> ScanQueueEntry:
        scan_task = self.read_task(scan_id)
        entry = self.get_entry(scan_id)
        if scan_task is None or entry is None:
            raise FileNotFoundError(scan_id)
        scan_task.protocol_name = protocol_name
        entry.protocol_name = protocol_name
        self.write_task(scan_id, scan_task)
        return entry

    def update_parameters(self, scan_id: str, parameters: dict) -> Tuple[ScanTask, ValidateResponse]:
        scan_task = self.read_task(scan_id)
        if scan_task is None:
            raise FileNotFoundError(scan_id)
        result = validate_parameters(scan_task.sequence, parameters, scan_task)
        if result.ok:
            scan_task.parameters = parameters
            self.write_task(scan_id, scan_task)
        return scan_task, result

    def save_scan_as_protocol(self, scan_id: str, protocol_name: str) -> Protocol:
        return self.save_scans_as_protocol([scan_id], protocol_name)

    def save_scans_as_protocol(
        self, scan_ids: List[str], protocol_name: str
    ) -> Protocol:
        if not scan_ids:
            raise ValueError("Select at least one scan")

        protocol_sequences: List[ProtocolSequence] = []
        for scan_id in scan_ids:
            scan_task = self.read_task(scan_id)
            if scan_task is None:
                raise FileNotFoundError(scan_id)
            result = validate_parameters(
                scan_task.sequence, scan_task.parameters, scan_task
            )
            if not result.ok:
                message = "; ".join(result.problems) or "Invalid parameters"
                raise ValueError(message)
            protocol_sequences.append(
                ProtocolSequence(
                    name=scan_task.protocol_name or scan_task.sequence,
                    sequence=scan_task.sequence,
                    parameters=deepcopy(scan_task.parameters),
                )
            )

        protocol = Protocol(
            id=helper.generate_uid(),
            name=protocol_name,
            sequences=protocol_sequences,
        )
        save_protocol(protocol)
        return protocol

    def insert_protocol(
        self, protocol_id: str, exam_id: str, prepared: bool = False
    ) -> List[ScanQueueEntry]:
        if not self.exam_active() or self.exam.id != exam_id:
            raise FileNotFoundError(exam_id)

        protocol = load_protocol(protocol_id)
        if protocol is None:
            raise FileNotFoundError(protocol_id)

        for saved_sequence in protocol.sequences:
            scan_task = ScanTask(
                sequence=saved_sequence.sequence,
                protocol_name=saved_sequence.name,
                patient=self.patient,
                exam=self.exam,
                system=self.system,
                parameters=deepcopy(saved_sequence.parameters),
            )
            result = validate_parameters(
                saved_sequence.sequence, saved_sequence.parameters, scan_task
            )
            if not result.ok:
                message = "; ".join(result.problems) or "Invalid parameters"
                raise ValueError(message)

        entries: List[ScanQueueEntry] = []
        try:
            for saved_sequence in protocol.sequences:
                entry = self.create_scan(
                    saved_sequence.sequence, saved_sequence.name
                )
                entries.append(entry)
                scan_task = self.read_task(entry.id)
                if scan_task is None:
                    raise RuntimeError("Failed to read inserted scan")
                scan_task.parameters = deepcopy(saved_sequence.parameters)
                if not self.write_task(entry.id, scan_task):
                    raise RuntimeError("Failed to update inserted scan")
        except Exception:
            for entry in reversed(entries):
                try:
                    self.delete_scan(entry.id)
                except Exception:
                    pass
            raise

        if prepared:
            for entry in entries:
                self.set_prepared(entry.id, True)
            self.refresh_queue()
            entries = [self.get_entry(entry.id) or entry for entry in entries]

        return entries


session = ConsoleSession()
