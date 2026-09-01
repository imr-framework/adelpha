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
    """True if the scanner answers ICMP, matching MRI4ALL's original probe."""
    return bool(probe_scanner(ip)["reachable"])


def _marcos_handshake(host: str, port: int, timeout: float) -> None:
    """Complete MaRCoS request/reply, then close. Never open-and-drop TCP.

    marcos_server is single-client: an empty connect() is accept()'d and the
    server sits in mpack_tree_parse until the socket dies. That races a scan.
    """
    import msgpack
    from external.marcos_client.server_comms import construct_packet

    sock = socket.create_connection((host, port), timeout=timeout)
    try:
        sock.sendall(msgpack.packb(construct_packet({"regstatus": 1})))
        unpacker = msgpack.Unpacker()
        while True:
            buf = sock.recv(4096)
            if not buf:
                raise OSError("MaRCoS closed during handshake")
            unpacker.feed(buf)
            for _ in unpacker:
                return
    finally:
        try:
            sock.close()
        except OSError:
            pass


def probe_scanner(
    ip: str, port: int | None = None, timeout: float = PROBE_TIMEOUT_S
) -> dict:
    """Check whether a Red Pitaya / MaRCoS server is on the network.

    MRI4ALL only ICMP-pinged the board. A MaRCoS handshake is optional and
    uses a real protocol packet so the server is not left in parse-wait.
    """
    if port is None:
        port = marcos_port()
    host = (ip or "").strip()
    if not host or host in {"0.0.0.0", "::"}:
        return {
            "reachable": False,
            "method": "none",
            "detail": "No scanner IP configured",
        }

    icmp_ok = _icmp_ping(host)
    try:
        _marcos_handshake(host, port, timeout)
        detail = f"MaRCoS at {host}:{port}"
        log.info("Scanner reachable: %s", detail)
        return {"reachable": True, "method": "tcp", "detail": detail}
    except OSError as exc:
        tcp_err = exc

    if icmp_ok:
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


def marcos_port() -> int:
    try:
        from sequences.common.util import reading_json_parameter

        return int(reading_json_parameter().marcos_parameters.port)
    except Exception:
        return MARCOS_PORT


def config_scanner_ip() -> str:
    import common.config as config

    config.load_config()
    return config.get_config().scanner_ip
