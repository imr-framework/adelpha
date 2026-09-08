from pathlib import Path

import numpy as np
import time

import external.seq.adjustments_acq.config as cfg
import external.seq.adjustments_acq.scripts as scr  # pylint: disable=import-error
from external.seq.adjustments_acq.calibration import rf_duration_cal
from sequences.common.util import reading_json_parameter
from common.ipc import Communicator
ipc_comm = Communicator(Communicator.ACQ)
import common.logger as logger
from common.types import ResultItem
import matplotlib.pyplot as plt
import pickle
import time


from sequences import PulseqSequence
from sequences.common import make_rf_se


log = logger.get_logger()


class AdjRFDuration(PulseqSequence, registry_key=Path(__file__).stem):
    @classmethod
    def get_readable_name(self) -> str:
        return "Adjust RF Duration  [untested]"

    rf_duration_vals = []

    def calculate_sequence(self, scan_task, points=3) -> bool:
        scan_task.processing.recon_mode = "bypass"
        rf_min_duration, rf_max_duration = 50e-6, 100e-6  # in seconds
        self.rf_duration_vals = np.linspace(
            rf_min_duration, rf_max_duration, num=points, endpoint=True
        )
        log.info("Durations are: " + str(self.rf_duration_vals))
        # Calculating sequence for different RF pulse durations
        for i in range(points):
            
            self.seq_file_path = (
                self.get_working_folder()
                + "/seq/acq"
                + str(i + 1)
                + ".seq"
            )
            log.info(self.seq_file_path)
            print(f"{self.rf_duration_vals[i]:.4f}  ({i}/{points})")
            ipc_comm.send_status(
            f"Adjusting duration:  Searching {self.rf_duration_vals[i]:.4f}  ({i+1}/{points})"
            )
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
                check_timing=False,
                output_file=self.seq_file_path,
                rf_duration=self.rf_duration_vals[i],
            )
            log.info("Done calculating sequence " + self.get_name())
            self.calculated = True

        return True

    def run_sequence(self, scan_task,points=3) -> bool:
        log.info("Running RF calibration sequences ")

        # reading configuration data from config.json
        configuration_data = reading_json_parameter()

        
        tr_spacing = 5  # [us] Time between repetitions

        # Make sure the TR units are right (in case someone puts in us rather than s)
        if tr_spacing >= 30:
            print(
                'TR spacing is over 30 seconds! Set "force_tr" to True if this isn\'t a mistake. '
            )
            return -1

        # Run sequences for different RF pulse duration
        print("Running RF duration calibration sequences")
        rxd_list = []
        peak_max_arr = []
        for i in range(points):
            seq_file = (
                self.get_working_folder()
                + "/seq/acq"
                + str(i + 1)
                + ".seq"
            )
            rxd, rx_t = scr.run_pulseq(
                seq_file,
                rf_center=cfg.LARMOR_FREQ,
                tx_t=1,
                grad_t=10,
                tx_warmup=100,
                shim_x=cfg.SHIM_X,
                shim_y=cfg.SHIM_Y,
                shim_z=cfg.SHIM_Z,
                rf_max=cfg.RF_MAX,
                grad_cal=False,
                save_np=True,
                save_mat=False,
                save_msgs=False,
                gui_test=False,
                case_path=self.get_working_folder(),
            )
            peak_max_arr.append(np.max(np.abs(rxd), axis=0, keepdims=False))
            rxd_list.append(rxd)
            time.sleep(tr_spacing)
            log.info(f"Step {i} / {self.rf_duration_vals[i]}: {np.sum(np.abs(rxd))}")


            # Print progress
            if (i + 1) % 5 == 0:
                print(f"Finished point {i + 1}/{points}...")

        # Identify the RF duration corresponding to the maximal echo amplitude
        # estimated_duration, rf_duration_vals, peak_max_arr = rf_duration_cal(rxd_list=rxd_list, points=points)
        estimated_duration  = self.rf_duration_vals[np.argmax(peak_max_arr)]
        log.info(f"Estimated optimal duration = {estimated_duration}")

        plt.clf()
        plt.title("RF Amplitude Calibration")
        plt.grid(True, color="#333")
        plt.plot(self.rf_duration_vals * 1e6, np.abs(peak_max_arr), marker="o")
        plt.xlabel("RF Duration [us]")
        plt.ylabel("Echo Amplitude [a.u.]")
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
        # configuration_data.rf_parameters.rf_maximum_amplitude_Hze = rf_duration
        # writing_json_parameter(config_data=configuration_data)

        log.info("Done RF calibration sequences ")
        return True
