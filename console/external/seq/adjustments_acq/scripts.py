#!/usr/bin/env python3
#
# Run a pulseq file
# Code by Lincoln Craven-Brightman
#

import sys
import os
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
import scipy.io as sio
import scipy.signal as sig
from operator import itemgetter

import external.seq.adjustments_acq.config as cfg  # pylint: disable=import-error
import external.marcos_client.experiment as ex  # pylint: disable=import-error

from external.flocra_pulseq.interpreter_pp import seq2flocra

import common.helper as helper
from common.constants import *
import common.logger as logger

log = logger.get_logger()

from common.ipc import Communicator


ipc_comm = Communicator(Communicator.ACQ)


# TODO: Remove references to cfg class from here
def run_pulseq(
    seq_file,
    rf_center=None,
    rf_max=None,
    gx_max=None,
    gy_max=None,
    gz_max=None,
    tx_t=1,
    grad_t=10,
    tx_warmup=100,
    shim_x=None,
    shim_y=None,
    shim_z=None,
    grad_cal=False,
    save_np=False,
    save_mat=False,
    save_msgs=False,
    expt=None,
    plot_instructions=False,
    gui_test=False,
    case_path="/tmp",
    raw_filename="",
    expected_duration_sec=-1,
    hardware_simulation=None,
    system=None,
):
    """
    Interpret pulseq .seq file through flocra_pulseq

    Args:
        seq_file (string): Pulseq file in mgh.config SEQ file directory
        rf_center (float): [MHz] Center for frequency (larmor)
        rf_max (float): [Hz] Maximum system RF value for instruction scaling
        g[x, y, z]_max (float): [Hz/m] Maximum system gradient values for x, y, z for instruction scaling
        tx_t (float): [us] Raster period for transmit
        grad_t (float): [us] Raster period for gradients
        tx_warmup (float): [us] Warmup time for transmit gate, used to check pulseq file
        shim_x, shim_y, shim_z (float): Shim value, defaults to config SHIM_ values, must be less than 1 magnitude
        grad_cal (bool): Default False, run GPA_FHDO gradient calibration
        save_np (bool): Default False, save data in .npy format in mgh.config DATA directory
        save_mat (bool): Default False, save data in .mat format in mgh.config DATA directory
        save_msgs (bool): Default False, save log messages in .txt format in mgh.config DATA directory
        expt (flocra_pulseq.interpreter): Default None, pass in existing experiment to continue an object
        plot_instructions (bool): Default None, plot instructions for debugging
        gui_test (bool): Default False, load dummy data for gui testing
        system (pp.Opts): Default None, system configuration for pypulseq
    Returns:
        numpy.ndarray: Rx data array
        float: (us) Rx period
    """
    try:
        cfg.update()
    except Exception:
        pass

    rf_center = cfg.LARMOR_FREQ if rf_center is None else rf_center
    rf_max = cfg.RF_MAX if rf_max is None else rf_max
    gx_max = cfg.GX_MAX if gx_max is None else gx_max
    gy_max = cfg.GY_MAX if gy_max is None else gy_max
    gz_max = cfg.GZ_MAX if gz_max is None else gz_max
    shim_x = cfg.SHIM_X if shim_x is None else shim_x
    shim_y = cfg.SHIM_Y if shim_y is None else shim_y
    shim_z = cfg.SHIM_Z if shim_z is None else shim_z

    log.info("Pulseq scan with Larmor %s", rf_center)
    log.info(
        "Full-scale calibrations (DAC ±1): RF max %s Hz; Gx %s Gy %s Gz %s Hz/m",
        rf_max,
        gx_max,
        gy_max,
        gz_max,
    )

    if hardware_simulation is None:
        try:
            import common.config as config

            hardware_simulation = config.get_config().is_hardware_simulation()
        except Exception:
            hardware_simulation = False

    log.debug("Running flocra_pulseq using following parameters:")
    log.debug("rf_center=%s rf_max=%s gx_max=%s gy_max=%s gz_max=%s", rf_center, rf_max, gx_max, gy_max, gz_max)
    log.debug("shim_x=%s shim_y=%s shim_z=%s seq=%s", shim_x, shim_y, shim_z, seq_file)
    log.info("case path = %s", case_path)

    try:
        from external.marcos_client.local_config import apply_scanner_settings
        from external.marcos_client import local_config as marcos_cfg

        apply_scanner_settings()
        clk_freq = float(marcos_cfg.fpga_clk_freq_MHz)
    except Exception as exc:
        log.warning("Could not apply MaRCoS settings: %s", exc)
        clk_freq = 122.88

    if system is None:
        import pypulseq as pp

        g_max = max(float(gx_max), float(gy_max), float(gz_max), 1.0)
        system = pp.Opts(
            max_grad=g_max,
            grad_unit="Hz/m",
            rf_ringdown_time=20e-6,
            rf_dead_time=100e-6,
            adc_dead_time=20e-6,
            rf_raster_time=max(float(tx_t), 1.0) * 1e-6,
            grad_raster_time=max(float(grad_t), 1.0) * 1e-6,
            block_duration_raster=1e-6,
        )

    psi = seq2flocra(
        center_freq=rf_center * 1e6,
        rf_amp_max=rf_max,
        system=system,
        clk_freq=clk_freq,
        gx_max=gx_max,
        gy_max=gy_max,
        gz_max=gz_max,
    )
    psi.load_seqfile(seq_file)
    psi.block_events_to_amps_times()
    instructions = psi._flo_dict
    log.info("GPA grad_t=%s us", psi._grad_t)

    try:
        instructions = shim(instructions, (shim_x, shim_y, shim_z))
    except Exception as exc:
        log.warning("Could not apply shim offsets: %s", exc)

    if plot_instructions:
        plt.clf()
        _, axs = plt.subplots(3, 1, sharex="col", constrained_layout=True)
        for key in ["tx0"]:
            if key in instructions:
                axs[0].step(instructions[key][0], abs(instructions[key][1]), where="post", label=key)
        for key in ["rx0_en"]:
            if key in instructions:
                axs[1].step(instructions[key][0], instructions[key][1], where="post", label=key)
        for key in ["grad_vx", "grad_vy", "grad_vz", "grad_vz2"]:
            if key in instructions:
                axs[2].step(instructions[key][0], instructions[key][1], where="post", label=key)
        for ax in axs:
            ax.legend()
            ax.grid(True, color="#333")

    if hardware_simulation:
        log.info("Hardware simulation set. Skipping scan.")
        return np.array([], dtype=np.complex128), psi._rx_t

    if expt is None:
        from external.marcos_client import local_config as marcos_cfg
        from sequences.common.util import reading_json_parameter

        init_gpa = False
        try:
            init_gpa = bool(reading_json_parameter().marcos_parameters.initialize_gpa)
        except Exception:
            init_gpa = False

        log.info(
            "Connecting to MaRCoS at %s:%s (init_gpa=%s)",
            marcos_cfg.ip_address,
            marcos_cfg.port,
            init_gpa,
        )
        try:
            expt = ex.Experiment(
                lo_freq=rf_center,
                rx_t=psi._rx_t,
                init_gpa=init_gpa,
                gpa_fhdo_offset_time=psi._grad_t / 3,
                grad_max_update_rate=0.0625,
                halt_and_reset=True,
            )
        except ConnectionError:
            raise
        except OSError as exc:
            hint = (
                " Turn off Initialize GPA in Settings if no gradient board is attached."
                if init_gpa
                else ""
            )
            raise ConnectionError(
                f"MaRCoS at {marcos_cfg.ip_address}:{marcos_cfg.port} dropped the connection: {exc}.{hint}"
            ) from exc
    
    # Optionally run gradient linearization calibration
    if grad_cal:
        expt.gradb.calibrate(
            channels=[0, 1, 2],
            max_current=1,
            num_calibration_points=30,
            averages=5,
            poly_degree=5,
        )

    # Load instructions
    # instructions = {
    #     "tx0": psi._flo_dict['tx0'],
    #     "tx_gate": psi._flo_dict['tx_gate'],
    #     "rx0_en": psi._flo_dict['rx0_en'],  # adc 0
    #     "grad_vx": psi._flo_dict['grad_vx'],
    #     "grad_vy": psi._flo_dict['grad_vy'],
    #     "grad_vz": psi._flo_dict['grad_vz'],
    #     }

    expt.add_flodict(instructions)

    # if plot_instructions:
    #     expt.plot_sequence()

    log.debug("Running instructions...")

    if expected_duration_sec > 0:
        ipc_comm.send_acq_data(helper.get_datetime(), expected_duration_sec, False)

    # Run experiment
   
    log.debug('instructions:.......')
    # log.debug(instructions)

    rxd, msgs = expt.run()

    # log.info('rxd shape:', rxd["rx0"].shape)

    # Optionally save messages
    if save_msgs:
        log.info("Received MaRCoS messages: %s", msgs)

    # Announce completion
    
    if not raw_filename:
        from datetime import datetime

        now = datetime.now()
        raw_filename = now.strftime("%y-%d-%m %H_%M_%S")

    # Optionally save rx output array as .npy file
    if save_np:
        filename = Path(case_path) / mri4all_taskdata.RAWDATA / f"{raw_filename}.npy"
        if os.path.exists(filename):
            os.remove(filename)
        np.save(filename, rxd["rx0"])

    # Optionally save rx output array as .mat file
    if save_mat:
        filename = Path(case_path) / mri4all_taskdata.RAWDATA / f"{raw_filename}.mat"
        if os.path.exists(filename):
            os.remove(filename)
        sio.savemat(filename, {"flocra_data": rxd["rx0"]})

    # Very dangerous to call the destructor here!
    # TODO: Check why this is needed and potential impact
    expt.__del__()

    # Return rx output array and rx period
    return rxd["rx0"], psi._rx_t



def shim(instructions, shim):
    """
    Modify gradient instructions to shim the gradients for the experiment

    Args:
        instructions (dict): Instructions to modify
        shim (tuple): X, Y, Z shim values to use

    Returns:
        dict: Shimmed instructions
    """
    grads = ["grad_vx", "grad_vy", "grad_vz"]
    for ch in range(3):
        if grads[ch] not in instructions:
            continue
        updates = instructions[grads[ch]][1]
        updates[:-1] = updates[:-1] + shim[ch]
        assert np.all(np.abs(updates) <= 1), (
            f"Shim {shim[ch]} was too large for {grads[ch]}: "
            + f"{updates[np.argmax(np.abs(updates))]}"
        )
        instructions[grads[ch]] = (instructions[grads[ch]][0], updates)
    return instructions


def recon_0d(rxd, rx_t, trs=1, larmor_freq=cfg.LARMOR_FREQ):
    """
    Reconstruct FFT data, pass data out to plotting or saving programs

    Args:
        rxd (numpy.ndarray): Rx data array
        rx_t (float): [us] Rx sample period
        trs (int): Number of repetitions to split apart
        larmor_freq (float): [MHz] Larmor frequency of data for FFT

    Returns:
        dict: Useful reconstructed data dictionary
    """
    # Split echos for FFT
    rx_arr = np.reshape(rxd, (trs, -1)).T
    rx_fft = np.fft.fftshift(
        np.fft.fft(np.fft.fftshift(rx_arr, axes=(0,)), axis=0), axes=(0,)
    )
    x = np.linspace(
        0, rx_arr.shape[0] * rx_t * 1e-6, num=rx_arr.shape[0], endpoint=False
    )

    fft_bw = 1 / (rx_t)
    fft_x = np.linspace(
        larmor_freq - fft_bw / 2, larmor_freq + fft_bw / 2, num=rx_fft.shape[0]
    )
    out_dict = {
        "dim": 0,
        "rxd": rxd,
        "rx_t": rx_t,
        "trs": trs,
        "rx_arr": rx_arr,
        "rx_fft": rx_fft,
        "x": x,
        "fft_bw": fft_bw,
        "fft_x": fft_x,
        "larmor_freq": larmor_freq,
    }
    return out_dict


def recon_1d(rxd, rx_t, trs=1, larmor_freq=cfg.LARMOR_FREQ):
    """
    Reconstruct 1D data, pass data out to plotting or saving programs

    Args:
        rxd (numpy.ndarray): Rx data array
        rx_t (float): [us] Rx sample period
        trs (int): Number of repetitions to split apart
        larmor_freq (float): [MHz] Larmor frequency of data for FFT

    Returns:
        dict: Useful reconstructed data dictionary
    """
    # Split echos for FFT
    rx_arr = np.reshape(rxd, (trs, -1)).T
    rx_fft = np.fft.fftshift(
        np.fft.fft(np.fft.fftshift(rx_arr, axes=(0,)), axis=0), axes=(0,)
    )
    x = np.linspace(
        0, rx_arr.shape[0] * rx_t * 1e-6, num=rx_arr.shape[0], endpoint=False
    )

    fft_bw = 1 / (rx_t)
    fft_x = np.linspace(
        larmor_freq - fft_bw / 2, larmor_freq + fft_bw / 2, num=rx_fft.shape[0]
    )
    out_dict = {
        "dim": 1,
        "rxd": rxd,
        "rx_t": rx_t,
        "trs": trs,
        "rx_arr": rx_arr,
        "rx_fft": rx_fft,
        "x": x,
        "fft_bw": fft_bw,
        "fft_x": fft_x,
        "larmor_freq": larmor_freq,
    }
    return out_dict


def recon_2d(rxd, trs, larmor_freq=cfg.LARMOR_FREQ):
    """
    Reconstruct 2D data, pass data out to plotting or saving programs

    Args:
        rxd (numpy.ndarray): Rx data array
        trs (int): Number of repetitions (Phase encode direction length)
        larmor_freq (float): [MHz] Larmor frequency of data for FFT

    Returns:
        dict: Useful reconstructed data dictionary
    """
    rx_arr = np.reshape(rxd, (trs, -1))
    rx_fft = np.fft.fftshift(np.fft.fft2(np.fft.fftshift(rx_arr)))
    out_dict = {
        "dim": 2,
        "rxd": rxd,
        "trs": trs,
        "rx_arr": rx_arr,
        "rx_fft": rx_fft,
        "larmor_freq": larmor_freq,
    }
    return out_dict


def peak_width_1d(recon_dict):
    """
    Find peak width from reconstructed data

    Args:
        recon_dict (dict): Reconstructed data dictionary

    Returns:
        dict: Line info dictionary
    """
    rx_fft, fft_x = itemgetter("rx_fft", "fft_x")(recon_dict)

    peaks, _ = sig.find_peaks(np.abs(rx_fft), width=2)
    peak_results = sig.peak_widths(np.abs(rx_fft), peaks, rel_height=0.95)
    max_peak = np.argmax(peak_results[0])
    fwhm = peak_results[0][max_peak]

    hline = np.array(
        [
            peak_results[1][max_peak],
            peak_results[2][max_peak],
            peak_results[3][max_peak],
        ]
    )
    hline[1:] = hline[1:] * (fft_x[1] - fft_x[0]) + fft_x[0]
    out_dict = {
        "hline": hline,
        "fwhm": fwhm,
    }
    return out_dict


def plot_signal_1d(recon_dict):
    # Example plotting function
    # Split echos for FFT
    x, rxd, rx_arr, rx_fft, fft_x = itemgetter("x", "rxd", "rx_arr", "rx_fft", "fft_x")(
        recon_dict
    )

    _, axs = plt.subplots(4, 1, constrained_layout=True)
    axs[0].plot(np.real(rxd))
    axs[0].set_title("Concatenated signal -- Real")
    axs[1].plot(np.abs(rxd))
    axs[1].set_title("Concatenated signal -- Magnitude")
    axs[2].plot(x, np.angle(rx_arr))
    axs[2].set_title("Stacked signals -- Phase")
    axs[3].plot(fft_x, np.abs(rx_fft))
    axs[3].set_title("Stacked signals -- FFT")
    plt.show()


def plot_signal_2d(recon_dict):
    # Example plotting function
    rx_arr, rx_fft, rxd = itemgetter("rx_arr", "rx_fft", "rxd")(recon_dict)

    _, axs = plt.subplots(3, 1, constrained_layout=True)
    axs[0].plot(np.real(rxd))
    axs[0].set_title("Concatenated signal -- Real")
    axs[1].plot(np.abs(rxd))
    axs[1].set_title("Concatenated signal -- Magnitude")
    axs[2].plot(np.abs(rx_arr))
    axs[2].set_title("Stacked signals -- Magnitude")
    fig, im_axs = plt.subplots(1, 2, constrained_layout=True)
    fig.suptitle("2D Image")
    im_axs[0].imshow(np.abs(rx_fft), cmap=plt.cm.bone)
    im_axs[0].set_title("Magnitude")
    im_axs[1].imshow(np.angle(rx_fft))
    im_axs[1].set_title("Phase")
    plt.show()


if __name__ == "__main__":
    # Maybe clean up
    if len(sys.argv) >= 2:
        command = sys.argv[1]
        if command == "pulseq":
            if len(sys.argv) == 3:
                seq_file = cfg.SEQ_PATH + sys.argv[2]
                _, rx_t = run_pulseq(seq_file, save_np=True, save_mat=True)
                log.debug(f"rx_t = {rx_t}")
            else:
                log.debug(
                    '"pulseq" takes one .seq filename as an argument (just the filename, make sure it\'s in your seq_files path!)'
                )
        elif command == "plot2d":
            if len(sys.argv) == 4:
                rxd = np.load(cfg.DATA_PATH + sys.argv[2])
                tr_count = int(sys.argv[3])
                plot_signal_2d(recon_2d(rxd, tr_count, larmor_freq=cfg.LARMOR_FREQ))
            else:
                log.debug('Format arguments as "plot2d [2d_data_filename] [tr count]"')
        elif command == "plot1d":
            if len(sys.argv) == 5:
                rxd = np.load(cfg.DATA_PATH + sys.argv[2])
                rx_t = float(sys.argv[3])
                tr_count = int(sys.argv[4])
                plot_signal_1d(recon_1d(rxd, rx_t, trs=tr_count))
            else:
                log.debug(
                    'Format arguments as "plot1d [1d_data_filename] [rx_t] [tr_count]"'
                )
        elif command == "plot_se":
            if len(sys.argv) == 5:
                rxd = np.load(cfg.DATA_PATH + sys.argv[2])
                rx_t = float(sys.argv[3])
                tr_count = int(sys.argv[4])
                plot_signal_1d(recon_0d(rxd, rx_t, trs=tr_count))
            else:
                log.debug(
                    'Format arguments as "plot_se [spin_echo_data_filename] [rx_t] [tr_count]"'
                )

        else:
            log.debug("Enter a script command from: [pulseq, plot_se, plot1d, plot2d]")
    else:
        log.debug("Enter a script command from: [pulseq, plot_se, plot1d, plot2d]")
