"""In-process acquisition and reconstruction workers for Adelpha.

MRI4ALL's standalone acq/recon services (`services.acq.main`, `services.recon.main`)
redirect stdout and assume systemd. Do not import those modules here. This
pipeline polls the same folder queue so Prepare in the Imaging Console actually
runs SequenceBase on macOS and Windows.
"""

from __future__ import annotations

import logging
import os
import threading
import time

import common.config as config
import common.helper as helper
import common.queue as queue
import common.runtime as rt
import common.task as task
from common.constants import mri4all_files, mri4all_paths, mri4all_taskdata

log = logging.getLogger("mri4all-api.pipeline")

_started = False
_stop = threading.Event()
_acq_enabled = threading.Event()
_recon_enabled = threading.Event()
_lock = threading.Lock()
_last_error = ""
_acq_busy = False
_recon_busy = False
_ipc = None


def last_error() -> str:
    return _last_error


def is_running() -> bool:
    return _started and not _stop.is_set()


def acq_enabled() -> bool:
    return is_running() and _acq_enabled.is_set()


def recon_enabled() -> bool:
    return is_running() and _recon_enabled.is_set()


def acq_busy() -> bool:
    return _acq_busy


def recon_busy() -> bool:
    return _recon_busy


def set_worker(name: str, enabled: bool) -> None:
    flag = _acq_enabled if name == "acq" else _recon_enabled
    if enabled:
        flag.set()
    else:
        flag.clear()
    log.info("%s worker %s", name, "enabled" if enabled else "paused")


def start() -> None:
    global _started
    with _lock:
        if _started:
            return
        from common.qtcompat import configure_headless

        configure_headless()
        try:
            import signal

            signal.signal(signal.SIGPIPE, signal.SIG_IGN)
        except (AttributeError, ValueError):
            pass
        queue.check_and_create_folders()
        try:
            queue.clear_folder(mri4all_paths.DATA_ACQ, mri4all_paths.DATA_FAILURE)
            queue.clear_folder(mri4all_paths.DATA_RECON, mri4all_paths.DATA_FAILURE)
        except Exception as exc:
            log.warning("Could not clear in-progress folders: %s", exc)

        _stop.clear()
        _acq_enabled.set()
        _recon_enabled.set()
        threading.Thread(target=_acq_loop, name="mri4all-acq", daemon=True).start()
        threading.Thread(target=_recon_loop, name="mri4all-recon", daemon=True).start()
        _started = True
        log.info("Adelpha acquisition and reconstruction pipeline started")


def stop() -> None:
    global _started
    _stop.set()
    _acq_enabled.clear()
    _recon_enabled.clear()
    _started = False


def _notify_status(message: str) -> None:
    global _ipc
    try:
        from common.ipc import Communicator

        if _ipc is None:
            _ipc = Communicator(Communicator.ACQ)
        _ipc.send_status(message)
    except Exception:
        log.debug("Could not send status to UI", exc_info=True)


def _set_error(message: str) -> None:
    global _last_error
    _last_error = message
    log.error(message)
    _notify_status(message)


def _plotting_defaults() -> None:
    try:
        import matplotlib

        matplotlib.use("Agg")
        import common.plotting as plotting

        plotting.set_plotting_defaults()
    except Exception as exc:
        log.debug("Plotting defaults skipped: %s", exc)


def _move_to_fail(scan_name: str, stage_dir: str) -> None:
    if not queue.move_task(os.path.join(stage_dir, scan_name), mri4all_paths.DATA_FAILURE):
        log.error("Failed to move scan %s to failure folder", scan_name)


def process_acquisition(scan_name: str) -> bool:
    from sequences import SequenceBase
    import external.seq.adjustments_acq.config as cfg

    log.info("Performing acquisition of %s", scan_name)
    config.load_config()
    _plotting_defaults()
    try:
        from external.marcos_client.local_config import apply_scanner_settings
        from external.marcos_client import local_config as marcos_cfg

        apply_scanner_settings()
        log.info("MaRCoS target %s:%s", marcos_cfg.ip_address, marcos_cfg.port)
    except Exception as exc:
        log.warning("Could not apply MaRCoS settings: %s", exc)

    folder = os.path.join(mri4all_paths.DATA_ACQ, scan_name)
    if not os.path.isfile(os.path.join(folder, mri4all_files.TASK)):
        _set_error(f"Scan {scan_name} has no scan.json")
        _move_to_fail(scan_name, mri4all_paths.DATA_ACQ)
        return False

    try:
        scan_task = task.read_task(folder)
    except Exception as exc:
        _set_error(f"Failed to read task for {scan_name}: {exc}")
        _move_to_fail(scan_name, mri4all_paths.DATA_ACQ)
        return False

    if scan_task.sequence not in SequenceBase.installed_sequences():
        _set_error(f"Sequence {scan_task.sequence} is not installed")
        _move_to_fail(scan_name, mri4all_paths.DATA_ACQ)
        return False

    scan_task.journal.acquisition_start = helper.get_datetime()
    task.write_task(folder, scan_task)
    task.clear_task_subfolder(folder, mri4all_taskdata.SEQ)

    try:
        cfg.update()
    except Exception:
        log.warning("Unable to reload acquisition config")

    current_step = ""
    try:
        current_step = "instantiation"
        seq_instance = SequenceBase.get_sequence(scan_task.sequence)()
        current_step = "set_working_folder"
        seq_instance.set_working_folder(folder)
        current_step = "set_parameters"
        params = {
            **seq_instance.get_default_parameters(),
            **(scan_task.parameters or {}),
        }
        if not seq_instance.set_parameters(params, scan_task):
            raise RuntimeError("Invalid protocol used to initialize sequence.")
        current_step = "calculate_sequence"
        if not seq_instance.calculate_sequence(scan_task):
            raise RuntimeError("Sequence did not calculate successfully.")
        current_step = "run_sequence"
        if not seq_instance.run_sequence(scan_task):
            raise RuntimeError("Sequence did not run successfully.")
    except Exception as exc:
        _set_error(f"Acquisition failed during {current_step}: {exc}")
        log.exception("Failed to run sequence %s", scan_task.sequence)
        scan_task.journal.failed_at = helper.get_datetime()
        scan_task.journal.fail_stage = "acquisition"
        task.write_task(folder, scan_task)
        _move_to_fail(scan_name, mri4all_paths.DATA_ACQ)
        return False

    scan_task.journal.acquisition_end = helper.get_datetime()
    task.write_task(folder, scan_task)
    task.clear_task_subfolder(folder, mri4all_taskdata.TEMP)
    log.info("Acquisition completed for %s", scan_name)
    if not queue.move_task(folder, mri4all_paths.DATA_QUEUE_RECON):
        _set_error(f"Failed to move {scan_name} to recon queue")
        return False
    return True


def process_reconstruction(scan_name: str) -> bool:
    log.info("Performing reconstruction of %s", scan_name)
    config.load_config()
    _plotting_defaults()

    folder = os.path.join(mri4all_paths.DATA_RECON, scan_name)
    if not os.path.isfile(os.path.join(folder, mri4all_files.TASK)):
        _set_error(f"Scan {scan_name} has no scan.json")
        _move_to_fail(scan_name, mri4all_paths.DATA_RECON)
        return False

    try:
        scan_task = task.read_task(folder)
    except Exception as exc:
        _set_error(f"Failed to read recon task for {scan_name}: {exc}")
        _move_to_fail(scan_name, mri4all_paths.DATA_RECON)
        return False

    scan_task.journal.reconstruction_start = helper.get_datetime()
    task.write_task(folder, scan_task)
    try:
        from services.recon.reconstruction import run_reconstruction

        if not run_reconstruction(folder, scan_task):
            raise RuntimeError("Reconstruction did not run successfully.")
    except Exception as exc:
        _set_error(f"Reconstruction failed: {exc}")
        log.exception("Exception during recon of %s", scan_name)
        scan_task.journal.fail_stage = "reconstruction"
        scan_task.journal.failed_at = helper.get_datetime()
        task.write_task(folder, scan_task)
        _move_to_fail(scan_name, mri4all_paths.DATA_RECON)
        return False

    try:
        scan_task.journal.reconstruction_end = helper.get_datetime()
        task.write_task(folder, scan_task)
    except Exception as exc:
        _set_error(f"Failed to write recon task for {scan_name}: {exc}")
        _move_to_fail(scan_name, mri4all_paths.DATA_RECON)
        return False

    log.info("Reconstruction completed for %s", scan_name)
    if not queue.move_task(folder, mri4all_paths.DATA_COMPLETE):
        _set_error(f"Failed to move {scan_name} to completed folder")
        return False
    return True


def _acq_loop() -> None:
    global _acq_busy
    while not _stop.is_set():
        if not _acq_enabled.is_set():
            time.sleep(0.25)
            continue
        selected = queue.get_scan_ready_for_acq()
        if not selected:
            time.sleep(0.2)
            continue
        log.info("Processing scan: %s", selected)
        rt.set_current_task_id(selected)
        _acq_busy = True
        try:
            if not queue.move_task(
                os.path.join(mri4all_paths.DATA_QUEUE_ACQ, selected),
                mri4all_paths.DATA_ACQ,
            ):
                _set_error(f"Failed to move {selected} into acquisition")
            else:
                process_acquisition(selected)
        except Exception as exc:
            _set_error(f"Acquisition loop error: {exc}")
            log.exception("Acquisition loop crashed")
        finally:
            _acq_busy = False
            rt.clear_current_task_id()


def _recon_loop() -> None:
    global _recon_busy
    while not _stop.is_set():
        if not _recon_enabled.is_set():
            time.sleep(0.25)
            continue
        selected = queue.get_scan_ready_for_recon()
        if not selected:
            time.sleep(0.2)
            continue
        log.info("Reconstructing scan: %s", selected)
        rt.set_current_task_id(selected)
        _recon_busy = True
        try:
            if not queue.move_task(
                os.path.join(mri4all_paths.DATA_QUEUE_RECON, selected),
                mri4all_paths.DATA_RECON,
            ):
                _set_error(f"Failed to move {selected} into reconstruction")
            else:
                process_reconstruction(selected)
        except Exception as exc:
            _set_error(f"Reconstruction loop error: {exc}")
            log.exception("Reconstruction loop crashed")
        finally:
            _recon_busy = False
            rt.clear_current_task_id()
