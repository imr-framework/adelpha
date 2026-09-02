"""seq2flocra API used by the updated MRI4ALL seq scripts.

The lab sequences import this name. Adelpha vendors the existing
``PSInterpreter`` behind it so the Imaging Console can run Pulseq files
until a native pypulseq interpreter is dropped in this package.
"""

from __future__ import annotations

from typing import Any

from external.flocra_pulseq.interpreter import PSInterpreter


class seq2flocra:
    def __init__(self, center_freq: float, rf_amp_max: float, system: Any = None, **kwargs: Any):
        self._center_freq = float(center_freq)
        self._rf_amp_max = float(rf_amp_max)
        self._system = system
        self._seq_file = None
        self._flo_dict: dict = {}
        self._rx_t = 1.0
        self._grad_t = float(kwargs.get("grad_t", 10) or 10)
        self._tx_t = float(kwargs.get("tx_t", 1) or 1)
        self._tx_warmup = float(kwargs.get("tx_warmup", 100) or 100)
        self._gx_max = kwargs.get("gx_max")
        self._gy_max = kwargs.get("gy_max")
        self._gz_max = kwargs.get("gz_max")
        self._log_file = kwargs.get("log_file", "/tmp/flocra")
        if system is not None:
            try:
                raster = float(getattr(system, "grad_raster_time"))
                if raster > 0:
                    self._grad_t = raster * 1e6
            except (TypeError, ValueError, AttributeError):
                pass
            try:
                rf_raster = float(getattr(system, "rf_raster_time"))
                if rf_raster > 0:
                    self._tx_t = rf_raster * 1e6
            except (TypeError, ValueError, AttributeError):
                pass

    def load_seqfile(self, seq_file: str) -> None:
        self._seq_file = seq_file

    def block_events_to_amps_times(self) -> None:
        if not self._seq_file:
            raise ValueError("No Pulseq file loaded")
        try:
            from external.marcos_client.local_config import apply_scanner_settings
            from external.marcos_client import local_config as marcos_cfg

            apply_scanner_settings()
            clk_t = 1.0 / float(marcos_cfg.fpga_clk_freq_MHz)
        except Exception:
            clk_t = 1.0 / 122.88

        psi = PSInterpreter(
            rf_center=self._center_freq,
            tx_warmup=self._tx_warmup,
            rf_amp_max=self._rf_amp_max,
            clk_t=clk_t,
            tx_t=self._tx_t,
            grad_t=self._grad_t,
            gx_max=self._gx_max,
            gy_max=self._gy_max,
            gz_max=self._gz_max,
            log_file=str(self._log_file),
        )
        instructions, param_dict = psi.interpret(self._seq_file)
        self._flo_dict = instructions
        self._rx_t = param_dict.get("rx_t", self._rx_t)
        self._grad_t = param_dict.get("grad_t", self._grad_t)
