from pathlib import Path
import matplotlib.pyplot as plt
import external.seq.adjustments_acq.config as cfg
from external.seq.adjustments_acq.calibration import (
    larmor_cal,
    larmor_step_search,
    load_plot_in_ui,
)
from sequences.common.util import reading_json_parameter, writing_json_parameter
import numpy as np
from sequences import PulseqSequence  # type: ignore
from sequences.common import make_rf_se  # type: ignore
import common.logger as logger
import pickle
from common.types import ResultItem
import external.seq.adjustments_acq.scripts as scr

log = logger.get_logger()


class AdjFrequency(PulseqSequence, registry_key=Path(__file__).stem):
    # Sequence parameters
    param_TE: int = 20
    param_TR: int = 250
    param_NSA: int = 1
    param_ADC_samples: int = 256
    param_ADC_duration: int = 6400

    @classmethod
    def get_readable_name(self) -> str:
        return "Adjust Frequency (Peak)"

    def calculate_sequence(self, scan_task) -> bool:
        log.info("Calculating sequence " + self.get_name())

        scan_task.processing.recon_mode = "bypass"
        self.seq_file_path = self.get_working_folder() + "/seq/acq0.seq"

        make_rf_se.pypulseq_rfse(
            inputs={
                "TE": self.param_TE,
                "TR": self.param_TR,
                "NSA": self.param_NSA,
                "ADC_samples": self.param_ADC_samples,
                "ADC_duration": self.param_ADC_duration,
                "FA1": 90,
                "FA2": 180,
            },
            check_timing=True,
            output_file=self.seq_file_path,
        )

        self.calculated = True
        log.info("Done calculating sequence " + self.get_name())
        return True
    
    def get_freq_offset(self, x, t):
        adc_time = t[-1]
        X = np.fft.fft(x)
        fmax = 1 / adc_time / 2 # -BW/2 to + BW/2
        f = np.linspace(-fmax, fmax,t.shape[0])
        del_f = f[-1] - f[-2]
        freq_offset = (np.argmax(np.abs(X)) - int(0.5 * t.shape[0])) * del_f
        return freq_offset

    def run_sequence(self, scan_task) -> bool:
        log.info("Running sequence " + self.get_name())
        
        # Read scanner configuration data from config.json
        # TODO: Needs to be reworked
        configuration_data = reading_json_parameter()
        working_folder = self.get_working_folder()
        scan_task.adjustment.rf.larmor_frequency = cfg.rf_parameters.larmor_frequency_MHz
        
        # TODO: Convert to classes later (using external packages for now)
        # Run the experiment from seq file
        rxd, rx_t = scr.run_pulseq(
            self.seq_file_path,
            rf_center=scan_task.adjustment.rf.larmor_frequency,
            tx_t=1,
            grad_t=10,
            tx_warmup=100,
            shim_x=cfg.SHIM_X,
            shim_y=cfg.SHIM_Y,
            shim_z=cfg.SHIM_Z,
            grad_cal=False,
            save_np=False,
            save_mat=False,
        )

        x = rxd
        t = rx_t
        adc_time = self.param_ADC_duration
        X = np.fft.fft(x)
        fmax = 1 / adc_time / 2 # -BW/2 to + BW/2
        f = np.linspace(-fmax, fmax,rxd.shape[0])
        del_f = f[-1] - f[-2]
        freq_offset = (np.argmax(np.abs(X)) - int(0.5 * rxd.shape[0])) * del_f

        log.info(
            f"Frequency offset (using peak signal): {freq_offset} MHz"
        )


        # freq_offset = get_freq_offset(self, rx_signal, rx_t)
        scan_task.adjustment.rf.larmor_frequency += freq_offset
        # Now scan again with the new frequency
        rxd, rx_t = scr.run_pulseq(
            self.seq_file_path,
            rf_center=scan_task.adjustment.rf.larmor_frequency,
            tx_t=1,
            grad_t=10,
            tx_warmup=100,
            shim_x=cfg.SHIM_X,
            shim_y=cfg.SHIM_Y,
            shim_z=cfg.SHIM_Z,
            grad_cal=False,
            save_np=False,
            save_mat=False,
        )

        # rx_signal = data_dict["rxd"]
        rx_signal = rxd
        log.info('Read the signal')
        plt.clf()
        plt.title("ADC Signal Final")
        plt.grid(True, color="#333")
        plt.plot(np.abs(rx_signal))
        file = open(self.get_working_folder() + "/other/peak_frequency.plot", "wb")
        fig = plt.gcf()
        pickle.dump(fig, file)
        file.close()

        result = ResultItem()
        result.name = "ADC"
        result.description = "Recorded ADC signal"
        result.type = "plot"
        result.primary = True
        result.autoload_viewer = 1
        result.file_path = "other/peak_frequency.plot"
        scan_task.results.append(result)
        log.info(
            f"Final Larmor frequency (using peak signal): {scan_task.adjustment.rf.larmor_frequency} MHz"
        )

        # Updating the Larmor frequency in the config.json file
        # TODO: Needs to be reworked
        configuration_data.rf_parameters.larmor_frequency_MHz = scan_task.adjustment.rf.larmor_frequency
        writing_json_parameter(config_data=configuration_data)
        # Reload the configuration -- otherwise it does not get updated until the next start
        cfg.update()
        log.info("Done running sequence " + self.get_name())
        return True
