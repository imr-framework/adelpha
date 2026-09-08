from pathlib import Path

import external.seq.adjustments_acq.config as cfg
from external.seq.adjustments_acq.calibration import rf_max_cal

import common.logger as logger
import matplotlib.pyplot as plt
from sequences import PulseqSequence  # type: ignore
from sequences.common import make_rf_se  # type: ignore
from sequences.common.util import reading_json_parameter, writing_json_parameter
import numpy as np
import pickle
from common.types import ResultItem

log = logger.get_logger()


class AdjRFAmplitude(PulseqSequence, registry_key=Path(__file__).stem):
    @classmethod
    def get_readable_name(self) -> str:
        return "Adjust RF Amplitude  [per coil]"

    def calculate_sequence(self, scan_task) -> bool:
        scan_task.processing.recon_mode = "bypass"
        self.seq_file_path = self.get_working_folder() + "/seq/acq0.seq"
        log.info("Calculating sequence " + self.get_name())

        make_rf_se.pypulseq_rfse(
            inputs={
                "TE": 20,
                "TR": 250,
                "NSA": 1,
                "ADC_samples": 4096,
                "ADC_duration": 6400,
                "FA1": 90,
                "FA2": 180,
            },
            check_timing=True,
            output_file=self.seq_file_path,
        )

        log.info("Done calculating sequence " + self.get_name())
        self.calculated = True
        return True

    def run_sequence(self, scan_task) -> bool:
        log.info("Running sequence " + self.get_name())

        # reading configuration data from config.json
        configuration_data = reading_json_parameter()

        est_rf_max, rf_pi2_fraction, data_dict = rf_max_cal(
            seq_file=self.seq_file_path,
            larmor_freq=cfg.LARMOR_FREQ,
            points=20,
            iterations=2,
            zoom_factor=2,
            shim_x=cfg.SHIM_X,
            shim_y=cfg.SHIM_Y,
            shim_z=cfg.SHIM_Z,
            tr_spacing=2,
            force_tr=False,
            first_max=False,
            smooth=True,
            plot=True,
            gui_test=False,
        )
        peak_max_arr = data_dict["peak_max_arr"]
        peak_max_arr = peak_max_arr.tolist()

        rf_amp_vals  = data_dict["rf_amp_vals"]
        rf_amp_vals = rf_amp_vals.tolist()
        
        rf_pi2_fraction = rf_amp_vals[np.argmax(peak_max_arr)]
        # dec_inds = np.where(peak_max_arr[:-1] >= peak_max_arr[1:])[0]
        # max_ind = dec_inds[0]
        # rf_pi2_fraction = rf_amp_vals[max_ind]
        
        
        
        plt.clf()
        plt.title("RF Amplitude Calibration")
        plt.grid(True, color="#333")
        plt.plot(rf_amp_vals, np.abs(peak_max_arr), marker="o")
        plt.xlabel("RF pi/2 fraction [a.u.]")   
        plt.ylabel("Signal [a.u.]")
        file = open(self.get_working_folder() + "/other/plot_rf_cal_result.plot", "wb")
        fig = plt.gcf()
        pickle.dump(fig, file)
        file.close()

        result = ResultItem()
        result.name = "RF_cal"
        result.description = "Recorded RF calibration signal"
        result.type = "plot"
        result.primary = True
        result.autoload_viewer = 1
        result.file_path = "other/plot_rf_cal_result.plot"
        scan_task.results.append(result)

        # updating the Larmor frequency in the config.json file
        # configuration_data.rf_parameters.rf_maximum_amplitude_Hze = est_rf_max
        configuration_data.rf_parameters.rf_pi2_fraction = rf_pi2_fraction
        writing_json_parameter(config_data=configuration_data)

        log.info("Done running sequence " + self.get_name())
        return True
