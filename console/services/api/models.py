from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from common.types import (
    ExamInformation,
    PatientInformation,
    ScanQueueEntry,
    ScanTask,
    SystemInformation,
)


class ExamStartRequest(BaseModel):
    patient: PatientInformation
    acc: str = ""
    patient_position: str = "HFS"


class ExamResponse(BaseModel):
    exam: ExamInformation
    patient: PatientInformation
    system: SystemInformation


class ScanCreateRequest(BaseModel):
    sequence: str
    protocol_name: str = ""
    prepared: bool = False


class ScanUpdateRequest(BaseModel):
    parameters: Optional[Dict[str, Any]] = None
    protocol_name: Optional[str] = None
    other: Optional[Dict[str, Any]] = None
    processing: Optional[Dict[str, Any]] = None


class ScanValidateRequest(BaseModel):
    parameters: Dict[str, Any] = Field(default_factory=dict)


class ValidateResponse(BaseModel):
    ok: bool
    problems: List[str] = Field(default_factory=list)


class SequenceInfo(BaseModel):
    id: str
    name: str
    description: str = ""
    adjustment: bool = False
    defaults: Dict[str, Any] = Field(default_factory=dict)
    parameter_schema: Dict[str, Any] = Field(default_factory=dict)


class DevicePingResponse(BaseModel):
    ip: str
    ok: bool
    simulation: bool = False
    reachable: bool = False
    method: str = ""
    detail: str = ""


class DeviceMarcosStartResponse(BaseModel):
    ok: bool
    started: bool = False
    compiled: bool = False
    bitstream: bool = False
    detail: str = ""
    ip: str = ""


class ServiceStatusResponse(BaseModel):
    acq: Optional[bool] = None
    recon: Optional[bool] = None
    mode: str = "unknown"
    last_error: str = ""
    sequence_registry: bool = False


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "mri4all-api"
    exam_active: bool = False
    sequences: int = 0
    hardware_simulation: bool = False
    sequence_registry: bool = False
    pipeline: bool = False


class EventRespondRequest(BaseModel):
    response: Any = None
    error: bool = False
    source: str = "acq"


class ScanDetail(BaseModel):
    entry: ScanQueueEntry
    task: Optional[ScanTask] = None
    folder: str = ""
    editing: bool = False
    prepared: bool = False
