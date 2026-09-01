"""FastAPI façade: exam/scan/sequence HTTP + WebSocket events.

Acquisition sequences talk to MaRCoS when hardware simulation is off.
This layer probes the Red Pitaya on /device/ping; it does not send
sequence payloads itself.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from common.qtcompat import configure_headless

configure_headless()

import common.config as config
import common.queue as queue
from common.types import PatientInformation

from services.api import events
from services.api.models import (
    DevicePingResponse,
    EventRespondRequest,
    ExamResponse,
    ExamStartRequest,
    HealthResponse,
    ScanCreateRequest,
    ScanDetail,
    ScanUpdateRequest,
    ScanValidateRequest,
    ServiceStatusResponse,
    ValidateResponse,
)
from services.api.sequences_api import get_sequence_info, list_sequences, registry_loaded, validate_parameters
from services.api.session import session
from services.ui.control import (
    control_service,
    probe_scanner,
    restart_device,
    run_device_test,
)
from common.constants import Service, ServiceAction

log = logging.getLogger("mri4all-api")

app = FastAPI(title="MRI4ALL API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    import asyncio
    import common.runtime as rt
    from services.api import pipeline
    from services.api.sequences_api import reset_registry_cache

    Path(rt.get_base_path(), "config").mkdir(parents=True, exist_ok=True)
    Path(rt.get_base_path(), "data").mkdir(parents=True, exist_ok=True)
    config.load_config()
    queue.check_and_create_folders()
    events.attach_loop(asyncio.get_running_loop())
    events.start_listeners()
    from sequences.common.util import reading_json_parameter

    reading_json_parameter()
    try:
        from external.marcos_client.local_config import apply_scanner_settings

        apply_scanner_settings()
    except Exception as exc:
        log.warning("Could not apply MaRCoS settings at startup: %s", exc)
    reset_registry_cache()
    pipeline.start()
    cfg = config.get_config()
    log.info(
        "MRI4ALL API ready (base=%s simulation=%s scanner=%s sequences=%s pipeline=%s)",
        rt.get_base_path(),
        cfg.is_hardware_simulation(),
        cfg.scanner_ip,
        len(list_sequences(include_adjustments=True)),
        pipeline.is_running(),
    )


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    from services.api import pipeline

    try:
        cfg = config.get_config()
        sim = cfg.is_hardware_simulation()
    except Exception:
        sim = True
    return HealthResponse(
        exam_active=session.exam_active(),
        sequences=len(list_sequences(include_adjustments=True)),
        hardware_simulation=sim,
        sequence_registry=registry_loaded(),
        pipeline=pipeline.is_running(),
    )


@app.get("/exams/current", response_model=Optional[ExamResponse])
def current_exam() -> Optional[ExamResponse]:
    if not session.exam_active():
        return None
    return ExamResponse(exam=session.exam, patient=session.patient, system=session.system)


@app.post("/exams", response_model=ExamResponse)
def start_exam(body: ExamStartRequest) -> ExamResponse:
    session.start_exam(body.patient, body.acc, body.patient_position)
    return ExamResponse(exam=session.exam, patient=session.patient, system=session.system)


@app.delete("/exams/current")
def end_exam() -> dict:
    if not session.exam_active():
        raise HTTPException(404, "No active exam")
    session.end_exam()
    return {"ok": True}


@app.get("/sequences")
def sequences(adjustments: bool = False):
    return list_sequences(include_adjustments=adjustments)


@app.post("/sequences/{name}/validate", response_model=ValidateResponse)
def sequence_validate(name: str, body: ScanValidateRequest) -> ValidateResponse:
    from common.types import ScanTask

    dummy = ScanTask(sequence=name, parameters=body.parameters)
    return validate_parameters(name, body.parameters, dummy)


@app.get("/scans")
def list_scans():
    return session.refresh_queue()


@app.post("/scans")
def create_scan(body: ScanCreateRequest):
    if not session.exam_active():
        raise HTTPException(409, "Start an exam first")
    try:
        entry = session.create_scan(body.sequence, body.protocol_name)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(500, str(exc)) from exc
    if body.prepared:
        session.set_prepared(entry.id, True)
        session.refresh_queue()
        entry = session.get_entry(entry.id) or entry
    return entry


@app.get("/scans/{scan_id}", response_model=ScanDetail)
def get_scan(scan_id: str) -> ScanDetail:
    session.refresh_queue()
    entry = session.get_entry(scan_id)
    if not entry:
        raise HTTPException(404, "Scan not found")
    folder = session.find_folder(scan_id) or ""
    from common.constants import mri4all_files
    from pathlib import Path

    return ScanDetail(
        entry=entry,
        task=session.read_task(scan_id),
        folder=folder,
        editing=bool(folder and (Path(folder) / mri4all_files.EDITING).is_file()),
        prepared=bool(folder and (Path(folder) / mri4all_files.PREPARED).is_file()),
    )


@app.patch("/scans/{scan_id}")
def patch_scan(scan_id: str, body: ScanUpdateRequest):
    scan_task = session.read_task(scan_id)
    if scan_task is None:
        raise HTTPException(404, "Scan not found")
    if body.protocol_name is not None:
        scan_task.protocol_name = body.protocol_name
        entry = session.get_entry(scan_id)
        if entry:
            entry.protocol_name = body.protocol_name
    if body.other is not None:
        scan_task.other = body.other
    if body.processing is not None:
        scan_task.processing = scan_task.processing.model_validate(
            {**scan_task.processing.model_dump(), **body.processing}
        )
    if body.parameters is not None:
        result = validate_parameters(scan_task.sequence, body.parameters, scan_task)
        if not result.ok:
            raise HTTPException(400, {"problems": result.problems})
        scan_task.parameters = body.parameters
    if not session.write_task(scan_id, scan_task):
        raise HTTPException(500, "Failed to write scan.json")
    return scan_task


@app.post("/scans/{scan_id}/prepare")
def prepare_scan(scan_id: str):
    try:
        session.set_prepared(scan_id, True)
    except FileNotFoundError:
        raise HTTPException(404, "Scan not found")
    session.refresh_queue()
    return session.get_entry(scan_id)


@app.post("/scans/{scan_id}/edit")
def edit_scan(scan_id: str):
    try:
        session.set_prepared(scan_id, False)
    except FileNotFoundError:
        raise HTTPException(404, "Scan not found")
    session.refresh_queue()
    return session.get_entry(scan_id)


@app.post("/scans/{scan_id}/stop")
def stop_scan(scan_id: str):
    try:
        session.halt(scan_id)
    except FileNotFoundError:
        raise HTTPException(404, "Scan not found")
    return {"ok": True}


@app.get("/config")
def get_config():
    config.load_config()
    return config.get_config().model_dump()


@app.put("/config")
def put_config(body: dict):
    cfg = config.get_config()
    cfg.update(body)
    cfg.save_to_file()
    try:
        from external.marcos_client.local_config import apply_scanner_settings

        apply_scanner_settings()
    except Exception as exc:
        log.warning("Could not apply MaRCoS settings: %s", exc)
    return cfg.model_dump()


@app.get("/config/acq")
def get_acq_config():
    from sequences.common.util import reading_json_parameter

    return reading_json_parameter().model_dump(mode="json")


@app.put("/config/acq")
def put_acq_config(body: dict):
    from sequences.common.pydanticConfig import Config
    from sequences.common.util import reading_json_parameter, writing_json_parameter
    import external.seq.adjustments_acq.config as cfg

    current = reading_json_parameter().model_dump(mode="json")
    for section, values in body.items():
        if section in current and isinstance(values, dict) and isinstance(current[section], dict):
            current[section].update(values)
        else:
            current[section] = values
    parsed = Config(**current)
    writing_json_parameter(parsed)
    try:
        cfg.update()
    except Exception as exc:
        log.warning("Could not reload adjustment config: %s", exc)
    try:
        from external.marcos_client.local_config import apply_scanner_settings

        apply_scanner_settings()
    except Exception as exc:
        log.warning("Could not apply MaRCoS settings: %s", exc)
    return parsed.model_dump(mode="json")


@app.post("/device/ping", response_model=DevicePingResponse)
def device_ping() -> DevicePingResponse:
    from services.ui.control import marcos_port

    config.load_config()
    cfg = config.get_config()
    probe = probe_scanner(cfg.scanner_ip, port=marcos_port())
    return DevicePingResponse(
        ip=cfg.scanner_ip,
        ok=bool(probe["reachable"]),
        simulation=cfg.is_hardware_simulation(),
        reachable=bool(probe["reachable"]),
        method=str(probe["method"]),
        detail=str(probe["detail"]),
    )


@app.get("/device/services", response_model=ServiceStatusResponse)
def device_services() -> ServiceStatusResponse:
    from services.api import pipeline

    if pipeline.is_running():
        return ServiceStatusResponse(
            acq=pipeline.acq_enabled(),
            recon=pipeline.recon_enabled(),
            mode="adelpha",
            last_error=pipeline.last_error(),
            sequence_registry=registry_loaded(),
        )
    acq = control_service(ServiceAction.STATUS, Service.ACQ_SERVICE)
    recon = control_service(ServiceAction.STATUS, Service.RECON_SERVICE)
    mode = "systemd" if acq is not None or recon is not None else "unavailable"
    if acq is False and recon is False:
        mode = "unavailable"
    return ServiceStatusResponse(
        acq=acq,
        recon=recon,
        mode=mode,
        sequence_registry=registry_loaded(),
    )


@app.delete("/scans/{scan_id}")
@app.post("/scans/{scan_id}/delete")
def delete_scan(scan_id: str):
    try:
        session.delete_scan(scan_id)
    except FileNotFoundError:
        raise HTTPException(404, "Scan not found")
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(500, str(exc)) from exc
    return {"ok": True}


@app.post("/scans/{scan_id}/duplicate")
def duplicate_scan(scan_id: str):
    try:
        return session.duplicate_scan(scan_id)
    except FileNotFoundError:
        raise HTTPException(404, "Scan not found")
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(500, str(exc)) from exc


@app.get("/about")
def about():
    import common.runtime as rt

    return {
        "title": "MRI4ALL Console",
        "subtitle": "The Open-Source MRI Software",
        "version": app.version,
        "url": "https://mri4all.org",
        "base": rt.get_base_path(),
        "system": session.system.model_dump(),
    }


@app.get("/logs/{name}")
def read_log(name: str):
    import common.runtime as rt

    allowed = {"acq", "recon", "ui", "api"}
    if name not in allowed:
        raise HTTPException(400, "Unknown log")
    path = Path(rt.get_base_path()) / "logs" / f"{name}.log"
    if not path.is_file():
        return {"name": name, "lines": [f"— no log file at {path} —"]}
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        raise HTTPException(500, str(exc)) from exc
    return {"name": name, "lines": text.splitlines()[-2000:]}


@app.get("/studies")
def list_studies():
    from common.constants import mri4all_paths
    import common.task as task_mod

    exams = []
    seen = {}
    for root in (mri4all_paths.DATA_COMPLETE, mri4all_paths.DATA_ARCHIVE, mri4all_paths.DATA_FAILURE):
        folder = Path(root)
        if not folder.is_dir():
            continue
        for exam_dir in sorted(folder.iterdir(), key=os.path.getmtime, reverse=True):
            if not exam_dir.is_dir() or "#" not in exam_dir.name:
                continue
            exam_id = exam_dir.name.split("#", 1)[0]
            scan_task = task_mod.read_task(str(exam_dir))
            if not scan_task:
                continue
            exam = seen.get(exam_id)
            if exam is None:
                when = scan_task.exam.registration_time.replace("T", " ").split(".")[0]
                exam = {
                    "id": exam_id,
                    "acc": scan_task.exam.acc,
                    "patientName": f"{scan_task.patient.last_name}, {scan_task.patient.first_name}",
                    "mrn": scan_task.patient.mrn,
                    "examTime": when,
                    "scans": [],
                }
                seen[exam_id] = exam
                exams.append(exam)
            exam["scans"].append(
                {
                    "id": scan_task.id,
                    "folder": exam_dir.name,
                    "path": str(exam_dir),
                    "protocol_name": scan_task.protocol_name,
                    "scan_number": scan_task.scan_number,
                    "sequence": scan_task.sequence,
                    "failed": bool(scan_task.journal.failed_at),
                    "results": [r.model_dump() for r in scan_task.results],
                    "task": scan_task.model_dump(),
                }
            )
    for exam in exams:
        exam["scans"] = sorted(exam["scans"], key=lambda s: s["scan_number"])
    exams.sort(key=lambda e: e.get("examTime") or "", reverse=True)
    return exams


@app.get("/device/disk")
def device_disk():
    import shutil
    import common.runtime as rt

    usage = shutil.disk_usage(rt.get_base_path())
    return {
        "total": usage.total,
        "used": usage.used,
        "free": usage.free,
        "percent": int(usage.used / usage.total * 100) if usage.total else 0,
    }


@app.post("/device/services/{service}/{action}")
def device_one_service(service: str, action: str):
    from services.api import pipeline

    mapping = {"acq": Service.ACQ_SERVICE, "recon": Service.RECON_SERVICE}
    if service not in mapping:
        raise HTTPException(400, "service must be acq or recon")
    try:
        act = ServiceAction(action)
    except ValueError:
        raise HTTPException(400, "action must be start, stop, kill, or status")
    if pipeline.is_running() and act != ServiceAction.STATUS:
        pipeline.set_worker(service, act == ServiceAction.START)
        return device_services()
    result = control_service(act, mapping[service])
    return device_services() if act != ServiceAction.STATUS else {"ok": result}


@app.post("/device/test")
def device_test():
    return {"ok": bool(run_device_test())}


@app.post("/device/reset")
def device_reset():
    return {"ok": bool(restart_device())}


@app.post("/studies/clone")
def clone_study_scan(body: dict):
    folder = str(body.get("path") or "")
    if not folder:
        raise HTTPException(400, "path required")
    try:
        return session.clone_from_folder(folder)
    except FileNotFoundError:
        raise HTTPException(404, "Scan folder not found")
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc


@app.post("/dicom/send")
def dicom_send(body: dict):
    from services.ui.dicomexport import send_dicoms

    config.load_config()
    cfg = config.get_config()
    name = str(body.get("target") or "")
    folders = body.get("folders") or []
    target = next((t for t in cfg.dicom_targets if t.name == name), None)
    if target is None and cfg.dicom_targets:
        target = cfg.dicom_targets[0]
    if target is None:
        raise HTTPException(400, "No DICOM target configured")
    errors = []
    for folder in folders:
        try:
            send_dicoms(Path(folder) / "dicom", target)
        except Exception as exc:
            errors.append(f"{folder}: {exc}")
    if errors:
        raise HTTPException(500, "; ".join(errors))
    return {"ok": True}


@app.get("/assets/scanner.png")
def scanner_asset():
    from fastapi.responses import FileResponse
    import common.runtime as rt

    candidates = [
        Path(rt.get_console_path()) / "services/ui/assets/mri4all_z1.png",
        Path(__file__).resolve().parents[2] / "services/ui/assets/mri4all_z1.png",
    ]
    for path in candidates:
        if path.is_file():
            return FileResponse(path, media_type="image/png")
    raise HTTPException(404, "Scanner image not found")


def _resolve_scan_folder(folder: str) -> Path:
    from common.constants import mri4all_paths

    p = Path(folder).expanduser().resolve()
    roots = [
        Path(mri4all_paths.DATA_COMPLETE).resolve(),
        Path(mri4all_paths.DATA_ARCHIVE).resolve(),
        Path(mri4all_paths.DATA_FAILURE).resolve(),
        Path(mri4all_paths.DATA_ACQ).resolve(),
        Path(mri4all_paths.DATA_RECON).resolve(),
        Path(mri4all_paths.DATA_QUEUE_ACQ).resolve(),
        Path(mri4all_paths.DATA_QUEUE_RECON).resolve(),
    ]
    if not any(root == p or root in p.parents for root in roots):
        raise HTTPException(403, "Path not allowed")
    if not p.exists():
        raise HTTPException(404, "Scan folder not found")
    return p


def _resolve_result_path(folder: str, file_path: str) -> Path:
    base = _resolve_scan_folder(folder)
    rel = (file_path or "").lstrip("/\\")
    target = (base / rel).resolve() if rel else base
    if target != base and base not in target.parents:
        raise HTTPException(403, "Path not allowed")
    return target


def _png_data_url(image) -> str:
    import base64
    from io import BytesIO

    buf = BytesIO()
    image.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


@app.get("/studies/preview")
def study_preview(folder: str, file_path: str = "", result_type: str = "", index: int = 0):
    """Render a DICOM slice or pickled matplotlib plot the way ViewerWidget does."""
    kind = (result_type or "").lower()
    target = _resolve_result_path(folder, file_path)
    empty = {
        "kind": "empty",
        "slices": 0,
        "index": 0,
        "vmin": 0,
        "vmax": 0,
        "histogram": [],
        "image": "",
        "error": "",
    }
    try:
        if kind == "dicom":
            import numpy as np
            import pydicom
            from PIL import Image

            if target.is_file():
                files = [target]
            elif target.is_dir():
                files = sorted(target.glob("*.dcm"))
            else:
                files = sorted(target.parent.glob(target.name + "*.dcm"))
            if not files:
                empty["error"] = "No DICOM files found"
                return empty
            idx = max(0, min(index, len(files) - 1))
            arr = pydicom.dcmread(str(files[idx])).pixel_array.astype("float32")
            vmin = float(arr.min())
            vmax = float(arr.max())
            hist, _ = np.histogram(arr, bins=64)
            if vmax > vmin:
                scaled = ((arr - vmin) / (vmax - vmin) * 255.0).clip(0, 255).astype("uint8")
            else:
                scaled = np.zeros(arr.shape, dtype="uint8")
            return {
                "kind": "dicom",
                "slices": len(files),
                "index": idx,
                "vmin": vmin,
                "vmax": vmax,
                "histogram": hist.tolist(),
                "image": _png_data_url(Image.fromarray(scaled, mode="L")),
                "error": "",
            }
        if kind == "plot":
            import pickle
            from io import BytesIO
            import matplotlib

            matplotlib.use("Agg")
            if not target.is_file():
                empty["error"] = "Plot file not found"
                return empty
            with open(target, "rb") as handle:
                fig = pickle.load(handle)
            try:
                fig.tight_layout()
            except Exception:
                pass
            buf = BytesIO()
            fig.savefig(buf, format="png", dpi=110, facecolor=fig.get_facecolor(), bbox_inches="tight")
            try:
                import matplotlib.pyplot as plt

                plt.close(fig)
            except Exception:
                pass
            import base64

            return {
                "kind": "plot",
                "slices": 1,
                "index": 0,
                "vmin": 0,
                "vmax": 0,
                "histogram": [],
                "image": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii"),
                "error": "",
            }
        empty["error"] = "Nothing to display"
        return empty
    except Exception as exc:
        empty["error"] = str(exc)
        return empty


@app.get("/studies/export")
def study_export(folder: str, file_path: str = ""):
    from io import BytesIO
    import zipfile
    from fastapi.responses import FileResponse, StreamingResponse

    target = _resolve_result_path(folder, file_path)
    if target.is_dir():
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as archive:
            for item in target.rglob("*"):
                if item.is_file():
                    archive.write(item, item.relative_to(target.parent))
        buf.seek(0)
        filename = f"{target.name}.zip"
        return StreamingResponse(
            buf,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    if not target.is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(target, filename=target.name)


@app.post("/events/{event_id}/respond")
def event_respond(event_id: str, body: EventRespondRequest):
    envelope = {
        "id": event_id,
        "error": body.error,
        "value": {"type": "user_response", "response": body.response},
    }
    target = body.source if body.source in ("acq", "recon") else "acq"
    ok = events.write_response(target, envelope)
    events.complete_pending(event_id, body.response)
    return {"ok": ok}


@app.websocket("/events")
async def event_socket(ws: WebSocket):
    await events.register(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        events.unregister(ws)
    except Exception:
        events.unregister(ws)
