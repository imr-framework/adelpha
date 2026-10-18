import sys
from pathlib import Path

import common.config as config


def get_ip_address():
    """
    Fetch the current IP address from the MRI4ALL configuration file.
    Note: Because the marcos files import the configuration file via
    "from ... import ...", multiple copies of the variable are created
    within different scopes. Call apply_scanner_settings() after a Settings
    save so Experiment uses the new IP, port, clock, and gradient board.
    """
    dummy_config = config.Configuration.load_from_file()
    return dummy_config.scanner_ip


## IP address: RP address or 'localhost' if emulating a local server.
try:
    ip_address = get_ip_address()
except Exception:
    ip_address = "10.42.0.251"

## Port: MaRCoS control port (default 11111)
port = 11111

## FPGA clock frequency. 122.88 MHz is the Red Pitaya 122-16 default.
fpga_clk_freq_MHz = 122.88

## Gradient board: "ocra1" or "gpa-fhdo"
grad_board = "gpa-fhdo"

## GPA-FHDO current per volt setting (determined by resistors)
gpa_fhdo_current_per_volt = 2.5

## Flocra-pulseq path. Prefer the copy shipped with Adelpha's console tree.
_flocra = Path(__file__).resolve().parents[1] / "flocra_pulseq"
if _flocra.is_dir():
    sys.path.append(str(_flocra))
sys.path.append("/opt/mri4all/external/flocra_pulseq")


def apply_scanner_settings() -> None:
    """Refresh module-level MaRCoS values from mri4all.json and config_acq.json."""
    global ip_address, port, fpga_clk_freq_MHz, grad_board, gpa_fhdo_current_per_volt
    try:
        ip_address = get_ip_address()
    except Exception:
        pass
    try:
        from sequences.common.util import reading_json_parameter

        params = reading_json_parameter().marcos_parameters
        port = int(params.port)
        # MRI4ALL's config_acq default was 122.8; MaRCoS on RP-122 only supports 122.88
        # (see local_config.py.example). Treat the truncated value as that clock.
        clock = float(params.fpga_clock_frequency_MHz)
        fpga_clk_freq_MHz = 122.88 if abs(clock - 122.8) < 0.001 else clock
        grad_board = str(params.gradient_board_type)
        gpa_fhdo_current_per_volt = float(params.gpa_fhdo_current_per_volt)
    except Exception:
        return
    try:
        import external.marcos_client.marcompile as mc

        mc.grad_board = grad_board
    except Exception:
        pass
