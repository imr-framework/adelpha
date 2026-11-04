from pathlib import Path
import subprocess

import common.logger as logger

log = logger.get_logger()

from common.config import DicomTarget


DCMSEND_ERROR_CODES = {
    1: "EXITCODE_COMMANDLINE_SYNTAX_ERROR",
    21: "EXITCODE_NO_INPUT_FILES",
    22: "EXITCODE_INVALID_INPUT_FILE",
    23: "EXITCODE_NO_VALID_INPUT_FILES",
    43: "EXITCODE_CANNOT_WRITE_REPORT_FILE",
    60: "EXITCODE_CANNOT_INITIALIZE_NETWORK",
    61: "EXITCODE_CANNOT_NEGOTIATE_ASSOCIATION",
    62: "EXITCODE_CANNOT_SEND_REQUEST",
    65: "EXITCODE_CANNOT_ADD_PRESENTATION_CONTEXT",
}


def _create_command(target: DicomTarget, source_folder: Path):
    """dcmsend argument list. Built without shell splitting so folders with spaces work and
    empty AE titles are omitted instead of swallowing the next option."""
    command = [
        "dcmsend",
        str(target.ip),
        str(target.port or 104),
        "+sd",
        str(source_folder),
    ]
    if target.aet_source:
        command += ["-aet", target.aet_source]
    if target.aet_target:
        command += ["-aec", target.aet_target]
    command += ["-nuc", "+sp", "*.dcm", "-to", "60"]
    return command


def handle_error(e, command):
    dcmsend_error_message = DCMSEND_ERROR_CODES.get(e.returncode, None)
    log.exception(f"Failed command:\n {command} \nbecause of {dcmsend_error_message}")
    if dcmsend_error_message:
        raise RuntimeError(
            f"Failed command:\n {' '.join(command)} \nbecause of\n {dcmsend_error_message}"
        ) from None
    raise


def send_dicoms(folder: Path, target: DicomTarget):
    command = _create_command(target, folder)
    try:
        result = subprocess.check_output(
            command, encoding="utf-8", stderr=subprocess.STDOUT
        )
    except FileNotFoundError:
        raise RuntimeError(
            "dcmsend (DCMTK) was not found. Install DCMTK and make sure it is on PATH."
        ) from None
    except subprocess.CalledProcessError as e:
        handle_error(e, command)
