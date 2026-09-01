import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.ui.marcos_boot import extras_dir, fpga_device, ensure_marcos_server, SSH_USER, DEFAULT_PASSWORD


def test_fpga_device_defaults_to_rp122():
    assert fpga_device(122.88) == "rp-122"
    assert fpga_device(122.8) == "rp-122"
    assert fpga_device(125.0) == "rp-125"


def test_extras_dir_finds_checkout_bitstreams():
    extras = extras_dir()
    assert extras is not None
    assert (extras / "copy_bitstream.sh").is_file()
    assert (extras / "marcos_fpga_rp-122.bit").is_file() or (extras / "marcos_fpga_rp-122.bit.bin").is_file()


def test_wiki_default_login_is_root_root():
    assert SSH_USER == "root"
    assert DEFAULT_PASSWORD == "root"


def test_ensure_skips_when_tcp_already_up():
    probe = {"reachable": True, "method": "tcp", "detail": "MaRCoS at 169.254.44.172:11111"}
    with patch("services.ui.control.probe_scanner", return_value=probe):
        result = ensure_marcos_server("169.254.44.172", port=11111)
    assert result["ok"] is True
    assert result["started"] is False
    assert "169.254.44.172" in result["detail"]


def test_ensure_rejects_empty_ip():
    result = ensure_marcos_server("")
    assert result["ok"] is False
    assert "No scanner IP" in result["detail"]
