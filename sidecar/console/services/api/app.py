"""FastAPI façade: exam/scan/sequence HTTP + WebSocket events.

Acquisition sequences talk to MaRCoS when hardware simulation is off.
This layer probes the Red Pitaya on /device/ping; it does not send
sequence payloads itself.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from fastapi import Body, FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from common.qtcompat import configure_headless

configure_headless()

import common.runtime as rt

rt.set_service_name("api")

import common.config as config
import common.queue as queue
from common.types import PatientInformation

from services.api import events
from services.api.models import (
    DeviceMarcosStartResponse,
    DevicePingResponse,
    EventRespondRequest,
    ExamResponse,
    ExamStartRequest,
    HealthResponse,
    ScanCreateRequest,
    ScanDetail,
    ScanPsdRequest,
    ScanPsdResponse,
    ScanUpdateRequest,
    ScanValidateRequest,
    SeqFileUploadResponse,
    ServiceStatusResponse,
    ValidateResponse,
)
from services.api.mrzero_sim import run_suite as run_mr0_suite
from services.api.sequences_api import get_sequence_info, import_seq_file, list_sequences, registry_loaded, validate_parameters
from services.api.session import session
from services.ui.control import (
    control_service,
    probe_scanner,
    restart_device,
    run_device_test,
)
from common.constants import Service, ServiceAction
import common.logger as logger

log = logger.get_logger()

app = FastAPI(title="MRI4ALL API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
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
    if not cfg.is_hardware_simulation():
        import threading
        from services.ui.marcos_boot import ensure_marcos_server, fpga_device
        from services.ui.control import marcos_port
        from sequences.common.util import reading_json_parameter

        def _boot_marcos() -> None:
            try:
                clock = reading_json_parameter().marcos_parameters.fpga_clock_frequency_MHz
                result = ensure_marcos_server(cfg.scanner_ip, port=marcos_port(), device=fpga_device(clock))
                if not result["ok"]:
                    log.warning("MaRCoS not started · %s", result["detail"])
            except Exception as exc:
                log.warning("MaRCoS startup skipped · %s", exc)

        threading.Thread(target=_boot_marcos, daemon=True, name="marcos-boot").start()
    else:
        log.info("Hardware simulation enabled · MaRCoS not started")
    list_sequences(include_adjustments=True)


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


@app.post("/mr0/simulate")
def mr0_simulate(body: Optional[dict] = Body(default=None)):
    suite = str((body or {}).get("suite") or "low-field")
    try:
        return run_mr0_suite(suite, body)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(503, str(exc)) from exc


@app.post("/sequences/seq-files", response_model=SeqFileUploadResponse)
async def upload_seq_file(request: Request, filename: str = Query("")) -> SeqFileUploadResponse:
    name = filename or request.headers.get("x-filename") or ""
    try:
        imported = import_seq_file(name, await request.body())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return SeqFileUploadResponse(name=imported)


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
    if probe.get("method") == "tcp":
        log.info("MaRCoS server running · %s", cfg.scanner_ip)
        log.info("%s", probe.get("detail") or f"MaRCoS at {cfg.scanner_ip}:{marcos_port()}")
    elif probe.get("reachable"):
        log.warning("Red Pitaya reachable · MaRCoS not listening on %s:%s", cfg.scanner_ip, marcos_port())
    else:
        log.warning("Scanner unreachable · %s", cfg.scanner_ip)
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


def _materialize_scan_seq(folder: Path, scan_task, parameters: dict) -> Path | None:
    """Build seq/acq0.seq from the queued sequence so PSD can show native gradients."""
    from sequences import SequenceBase

    try:
        inst = SequenceBase.get_sequence(scan_task.sequence)()
    except Exception:
        return None
    inst.set_parameters(parameters, scan_task)
    if not inst.set_working_folder(str(folder)):
        return None
    try:
        if not inst.calculate_sequence(scan_task):
            return None
    except Exception:
        return None
    played = folder / "seq" / "acq0.seq"
    return played if played.is_file() else None


@app.post("/scans/{scan_id}/psd", response_model=ScanPsdResponse)
def scan_psd(scan_id: str, body: ScanPsdRequest = Body(default_factory=ScanPsdRequest)):
    """Build a pulse-sequence diagram of every block and store it for Flex Viewer."""
    from common.seq_psd import find_seq_for_scan, write_psd_plot

    session.refresh_queue()
    folder = session.find_folder(scan_id)
    if not folder:
        raise HTTPException(404, "Scan not found")
    scan_task = session.read_task(scan_id)
    if scan_task is None:
        raise HTTPException(404, "Scan not found")
    parameters = dict(scan_task.parameters or {})
    if body.parameters:
        parameters.update(body.parameters)
    seq_path = find_seq_for_scan(Path(folder), parameters)
    if seq_path is None:
        seq_path = _materialize_scan_seq(Path(folder), scan_task, parameters)
    if seq_path is None:
        raise HTTPException(400, "No .seq file for this scan. Choose a sequence file first, or play the sequence once.")
    dest = Path(folder) / "other" / "psd.plot"
    title = seq_path.name if seq_path.name != "acq0.seq" else scan_task.protocol_name
    try:
        write_psd_plot(seq_path, dest, title=title)
    except Exception as exc:
        raise HTTPException(400, f"Could not plot the sequence: {exc}") from exc
    return ScanPsdResponse(folder=folder)


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
    allowed = {"acq", "recon", "ui", "api"}
    if name not in allowed:
        raise HTTPException(400, "Unknown log")
    return {"name": name, "lines": logger.collect_log_lines(name)}


@app.delete("/logs/{name}")
def delete_log(name: str):
    allowed = {"acq", "recon", "ui", "api"}
    if name not in allowed:
        raise HTTPException(400, "Unknown log")
    try:
        logger.clear_log_files(name)
    except OSError as exc:
        raise HTTPException(500, str(exc)) from exc
    return {"name": name, "ok": True}


@app.get("/studies")
def list_studies():
    from services.api import studies

    return studies.list_studies()


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


@app.post("/device/marcos/start", response_model=DeviceMarcosStartResponse)
def device_marcos_start() -> DeviceMarcosStartResponse:
    from services.ui.control import marcos_port
    from services.ui.marcos_boot import ensure_marcos_server, fpga_device
    from sequences.common.util import reading_json_parameter

    config.load_config()
    cfg = config.get_config()
    if cfg.is_hardware_simulation():
        log.info("Hardware simulation enabled · MaRCoS not started")
        return DeviceMarcosStartResponse(
            ok=True,
            detail="Hardware simulation is on — MaRCoS is not started",
            ip=cfg.scanner_ip,
        )
    clock = reading_json_parameter().marcos_parameters.fpga_clock_frequency_MHz
    result = ensure_marcos_server(cfg.scanner_ip, port=marcos_port(), device=fpga_device(clock), force=True)
    return DeviceMarcosStartResponse(**result)


@app.post("/studies/clone")
def clone_study_scan(body: dict):
    from services.api import studies

    folder = str(body.get("path") or "")
    if not folder:
        raise HTTPException(400, "path required")
    source = studies.resolve_scan_folder(folder)
    try:
        return session.clone_from_folder(str(source))
    except FileNotFoundError:
        raise HTTPException(404, "Scan folder not found")
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/dicom/send")
def dicom_send(body: dict):
    from services.api import studies
    from services.ui.dicomexport import send_dicoms

    config.load_config()
    cfg = config.get_config()
    name = str(body.get("target") or "")
    folders = body.get("folders") or []
    if isinstance(folders, str):
        folders = [folders]
    if not isinstance(folders, list) or not folders:
        raise HTTPException(400, "folders required")
    target = next((t for t in cfg.dicom_targets if t.name == name), None)
    if target is None and cfg.dicom_targets:
        target = cfg.dicom_targets[0]
    if target is None:
        raise HTTPException(400, "No DICOM target configured")
    errors = []
    for folder in folders:
        try:
            send_dicoms(studies.dicom_series_dir(str(folder)), target)
        except HTTPException as exc:
            errors.append(f"{folder}: {exc.detail}")
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


@app.get("/studies/preview")
def study_preview(
    folder: str,
    file_path: str = "",
    result_type: str = "",
    index: int = 0,
    width: int = 0,
    height: int = 0,
    scale: float = 1.0,
    all_slices: bool = False,
):
    """Render a DICOM slice or pickled matplotlib plot the way ViewerWidget does."""
    from services.api import studies

    return studies.build_preview(folder, file_path, result_type, index, width, height, scale, all_slices)


@app.get("/studies/export")
def study_export(folder: str, file_path: str = ""):
    from fastapi.responses import FileResponse
    from starlette.background import BackgroundTask
    from services.api import studies

    path, filename, temporary = studies.prepare_export(folder, file_path)
    if temporary:
        return FileResponse(
            path,
            filename=filename,
            media_type="application/zip",
            background=BackgroundTask(lambda: os.path.exists(path) and os.unlink(path)),
        )
    return FileResponse(path, filename=filename)


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
