"""Load the MaRCoS FPGA bitstream and start marcos_server on the Red Pitaya.

Matches the MRI4ALL wiki after every power-up:

    ./copy_bitstream.sh <IP> rp-122     # password: root
    ssh root@<IP>                       # password: root
    ~/marcos_server

https://github.com/mri4all/console/wiki/Setting-up-the-Red-Pitaya-board
"""

from __future__ import annotations

import os
import posixpath
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import common.logger as logger

log = logger.get_logger()

SSH_USER = "root"
# Documented Red Pitaya / MRI4ALL default. Override with ADELPHA_MARCOS_SSH_PASSWORD.
DEFAULT_PASSWORD = os.environ.get("ADELPHA_MARCOS_SSH_PASSWORD", "root")
_lock = threading.Lock()


def extras_dir() -> Path | None:
    here = Path(__file__).resolve()
    candidates = [
        here.parents[2] / "external" / "marcos_extras",
        Path(__file__).resolve().parents[3] / "console" / "external" / "marcos_extras",
    ]
    try:
        import common.runtime as rt

        candidates.append(Path(rt.get_console_path()) / "external" / "marcos_extras")
    except Exception:
        pass
    for path in candidates:
        if (path / "copy_bitstream.sh").is_file() or list(path.glob("marcos_fpga_rp-*.bit*")):
            return path
    return None


def server_src_dir() -> Path | None:
    extras = extras_dir()
    roots = []
    if extras:
        roots.append(extras.parent / "marcos_server")
    roots.append(Path(__file__).resolve().parents[2] / "external" / "marcos_server")
    for root in roots:
        if (root / "src" / "CMakeLists.txt").is_file():
            return root / "src"
    return None


def fpga_device(clock_mhz: float | None = None) -> str:
    if clock_mhz is not None and abs(float(clock_mhz) - 125.0) < 1:
        return "rp-125"
    return "rp-122"


def _password() -> str:
    return os.environ.get("ADELPHA_MARCOS_SSH_PASSWORD", DEFAULT_PASSWORD)


class RpSession:
    """One SSH/SFTP login to the Red Pitaya (password ``root`` unless overridden)."""

    def __init__(self, ip: str, timeout: float = 12):
        try:
            import paramiko
        except ImportError as exc:
            raise RuntimeError("paramiko is required to talk to the Red Pitaya over SSH") from exc

        self.ip = ip
        self._client = paramiko.SSHClient()
        self._client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            self._client.connect(
                hostname=ip,
                username=SSH_USER,
                password=_password(),
                timeout=timeout,
                banner_timeout=timeout,
                auth_timeout=timeout,
                allow_agent=True,
                look_for_keys=True,
            )
        except Exception as exc:
            raise RuntimeError(_connect_error(ip, exc)) from exc
        self._sftp = None

    def close(self) -> None:
        if self._sftp is not None:
            try:
                self._sftp.close()
            except Exception:
                pass
            self._sftp = None
        try:
            self._client.close()
        except Exception:
            pass

    def __enter__(self) -> RpSession:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def run(self, command: str, timeout: float = 30) -> tuple[int, str, str]:
        log.info("MaRCoS SSH %s: %s", self.ip, command.split("\n", 1)[0][:120])
        _, stdout, stderr = self._client.exec_command(command, timeout=timeout)
        stdout.channel.settimeout(timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        code = stdout.channel.recv_exit_status()
        return code, out, err

    def check(self, command: str, timeout: float = 30) -> str:
        code, out, err = self.run(command, timeout=timeout)
        if code != 0:
            raise RuntimeError((err or out or f"remote command failed ({code})").strip())
        return out

    def sftp(self):
        if self._sftp is None:
            self._sftp = self._client.open_sftp()
        return self._sftp

    def put(self, local: Path, remote: str) -> None:
        if not local.is_file():
            raise FileNotFoundError(str(local))
        log.info("MaRCoS SCP %s -> %s:%s", local.name, self.ip, remote)
        parent = posixpath.dirname(remote)
        if parent and parent != "/":
            self._mkdirs(parent)
        self.sftp().put(str(local), remote)

    def put_dir(self, local: Path, remote: str) -> None:
        self._mkdirs(remote)
        for item in sorted(local.iterdir()):
            if item.name.startswith("."):
                continue
            dest = posixpath.join(remote, item.name)
            if item.is_dir():
                self.put_dir(item, dest)
            else:
                self.put(item, dest)

    def _mkdirs(self, remote: str) -> None:
        ftp = self.sftp()
        parts = [p for p in remote.split("/") if p]
        cursor = ""
        for part in parts:
            cursor = f"{cursor}/{part}"
            try:
                ftp.stat(cursor)
            except OSError:
                ftp.mkdir(cursor)


def _connect_error(ip: str, exc: BaseException) -> str:
    text = str(exc).strip() or exc.__class__.__name__
    return (
        f"SSH to {SSH_USER}@{ip} failed ({text}). "
        f"MRI4ALL uses the Red Pitaya password 'root'. "
        f"Confirm the board is on the LAN and that ssh {SSH_USER}@{ip} works from a terminal."
    )


def _sync_clock(session: RpSession) -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    session.run(
        f'date -u -s "{stamp}" >/dev/null 2>&1 || date -Ins -s "{stamp}" >/dev/null 2>&1 || true'
    )


def _load_bitstream(session: RpSession, device: str) -> bool:
    extras = extras_dir()
    if extras is None:
        log.warning("marcos_extras not found; skipping FPGA bitstream")
        return False
    code, out, err = session.run("uname -n")
    if code != 0:
        raise RuntimeError((err or out or "uname failed").strip())
    host = out.strip()
    if host == "redpitaya":
        session.put(extras / f"marcos_fpga_{device}.bit.bin", "/lib/firmware/marcos_fpga.bit.bin")
        session.put(extras / f"marcos_fpga_{device}.dtbo", "/lib/firmware/marcos_fpga.dtbo")
        overlay = """
if [ -d /sys/kernel/config/device-tree/overlays/full ]; then rmdir /sys/kernel/config/device-tree/overlays/full; fi
echo 0 > /sys/class/fpga_manager/fpga0/flags
mkdir /sys/kernel/config/device-tree/overlays/full
echo -n marcos_fpga.dtbo > /sys/kernel/config/device-tree/overlays/full/path
"""
        session.check(overlay, timeout=40)
    else:
        session.put(extras / f"marcos_fpga_{device}.bit", "/tmp/marcos_fpga.bit")
        session.check("cat /tmp/marcos_fpga.bit > /dev/xdevcfg; rm -f /tmp/marcos_fpga.bit", timeout=40)
    log.info("Loaded MaRCoS bitstream %s onto %s (%s)", device, session.ip, host or "unknown image")
    return True


def _remote_has_server(session: RpSession) -> bool:
    code, _, _ = session.run("test -x ~/marcos_server")
    return code == 0


def _compile_server(session: RpSession) -> bool:
    src = server_src_dir()
    if src is None:
        raise RuntimeError(
            "marcos_server sources are not in this checkout and ~/marcos_server is missing on the Red Pitaya"
        )
    session.check("rm -rf /tmp/marcos_server && mkdir -p /tmp/marcos_server", timeout=20)
    session.put_dir(src, "/tmp/marcos_server/src")
    session.check(
        "cd /tmp/marcos_server && mkdir -p build && cd build && cmake ../src && make -j2 "
        "&& cp -f /tmp/marcos_server/build/marcos_server ~/marcos_server && chmod +x ~/marcos_server",
        timeout=180,
    )
    log.info("Compiled marcos_server on %s", session.ip)
    return True


def _start_server(session: RpSession) -> None:
    session.run("killall marcos_server >/dev/null 2>&1 || true")
    # Detach so the SSH session can close; same binary the wiki starts in a terminal.
    session.check(
        "nohup ~/marcos_server >/tmp/marcos_server.log 2>&1 </dev/null & echo $!",
        timeout=15,
    )


def _wait_for_server(ip: str, port: int, timeout: float = 12) -> bool:
    from services.ui.control import probe_scanner

    deadline = time.time() + timeout
    last: dict[str, Any] = {}
    while time.time() < deadline:
        last = probe_scanner(ip, port=port, timeout=1.0)
        if last.get("method") == "tcp":
            return True
        time.sleep(0.4)
    return last.get("method") == "tcp"


def _log_marcos_running(host: str, detail: str) -> None:
    log.info("MaRCoS server running · %s", host)
    log.info("%s", detail)


def ensure_marcos_server(
    ip: str,
    port: int = 11111,
    device: str = "rp-122",
    force: bool = False,
) -> dict[str, Any]:
    """Idempotent: no-op if MaRCoS already answers on `port` unless `force`."""
    host = (ip or "").strip()
    result: dict[str, Any] = {
        "ok": False,
        "started": False,
        "compiled": False,
        "bitstream": False,
        "detail": "",
        "ip": host,
    }
    if not host or host in {"0.0.0.0", "::", "127.0.0.1", "localhost"}:
        result["detail"] = "No scanner IP configured"
        return result

    from services.ui.control import probe_scanner

    if not force:
        probe = probe_scanner(host, port=port)
        if probe.get("method") == "tcp":
            result["ok"] = True
            result["detail"] = probe.get("detail") or f"MaRCoS at {host}:{port}"
            _log_marcos_running(host, result["detail"])
            return result

    if not _lock.acquire(blocking=False):
        result["detail"] = "MaRCoS setup is already running"
        return result
    try:
        if not force:
            probe = probe_scanner(host, port=port)
            if probe.get("method") == "tcp":
                result["ok"] = True
                result["detail"] = probe.get("detail") or f"MaRCoS at {host}:{port}"
                _log_marcos_running(host, result["detail"])
                return result

        with RpSession(host) as session:
            _sync_clock(session)
            result["bitstream"] = _load_bitstream(session, device)
            compiled = False
            if not _remote_has_server(session):
                compiled = _compile_server(session)
            result["compiled"] = compiled
            _start_server(session)
            log_tail = ""
            if not _wait_for_server(host, port):
                _, log_tail, _ = session.run("tail -n 20 /tmp/marcos_server.log 2>/dev/null || true", timeout=8)
                result["detail"] = (
                    f"Started ~/marcos_server on {host} but port {port} is not answering yet"
                    + (f": {log_tail.strip()}" if log_tail.strip() else "")
                )
                return result
        result["ok"] = True
        result["started"] = True
        result["detail"] = f"MaRCoS at {host}:{port}"
        _log_marcos_running(host, result["detail"])
        return result
    except (OSError, RuntimeError, FileNotFoundError, TimeoutError) as exc:
        result["detail"] = str(exc)
        log.warning("MaRCoS setup failed: %s", exc)
        return result
    finally:
        _lock.release()
