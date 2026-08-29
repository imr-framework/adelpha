import socket
import subprocess
import sys

import common.logger as logger

log = logger.get_logger()

from common.constants import Service, ServiceAction

MARCOS_PORT = 11111
PROBE_TIMEOUT_S = 1.5


def get_services() -> list[Service]:
    return [service for service in Service]


def control_service(action: ServiceAction, service: Service) -> bool | None:
    command = ["sudo", "systemctl", "--no-block", action.value, service.value]
    result = subprocess.run(
        command,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True,
    )

    if action == ServiceAction.STATUS:
        # Service is not installed
        if result.returncode == 4:
            return False
        return "active (running)" in result.stdout
    else:
        if result.returncode != 0:
            log.warning(f"Failed to {action.value} {service.value}")
            log.warning(f"Reason: {result.stderr}")
    return None


def control_services(action: ServiceAction) -> None:
    for service in get_services():
        control_service(action, service)


def ping(ip: str) -> bool:
    """True if the scanner answers on the MaRCoS port or ICMP."""
    return bool(probe_scanner(ip)["reachable"])


def probe_scanner(
    ip: str, port: int = MARCOS_PORT, timeout: float = PROBE_TIMEOUT_S
) -> dict:
    """Check whether a Red Pitaya / MaRCoS server is on the network.

    Prefers TCP to the MaRCoS control port. Falls back to ICMP so a
    powered-on board without MaRCoS still shows as reachable.
    """
    host = (ip or "").strip()
    if not host or host in {"0.0.0.0", "::"}:
        return {
            "reachable": False,
            "method": "none",
            "detail": "No scanner IP configured",
        }

    try:
        with socket.create_connection((host, port), timeout=timeout):
            detail = f"MaRCoS at {host}:{port}"
            log.info("Scanner reachable: %s", detail)
            return {"reachable": True, "method": "tcp", "detail": detail}
    except OSError as exc:
        tcp_err = exc

    if _icmp_ping(host):
        detail = f"{host} answers ping; MaRCoS port {port} is closed ({tcp_err})"
        log.info("Scanner ICMP only: %s", detail)
        return {"reachable": True, "method": "icmp", "detail": detail}

    detail = f"No response from {host}:{port} ({tcp_err})"
    log.info("Scanner unreachable: %s", detail)
    return {"reachable": False, "method": "none", "detail": detail}


def _icmp_ping(ip: str) -> bool:
    if sys.platform == "darwin":
        command = ["ping", "-c", "1", "-W", "1000", ip]
    elif sys.platform == "win32":
        command = ["ping", "-n", "1", "-w", "1000", ip]
    else:
        command = ["ping", "-c", "1", "-W", "1", ip]
    try:
        subprocess.check_output(command, stderr=subprocess.STDOUT, timeout=3)
        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        return False


def restart_device():
    log.info("Hard reset of acquisition device requested")
    # TODO
    return True


def run_device_bootsequence() -> bool:
    # TODO
    return True


def run_device_test() -> bool:
    return ping(config_scanner_ip())


def config_scanner_ip() -> str:
    import common.config as config

    config.load_config()
    return config.get_config().scanner_ip
