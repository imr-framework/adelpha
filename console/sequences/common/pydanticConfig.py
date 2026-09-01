from pydantic import BaseModel
from typing import List
from pathlib import Path
from common import runtime

### rf_parameters section
# Larmor is MHz. rf_maximum_amplitude_Hze is the Hz that maps to TX DAC ±1
# (flocra: pulse_Hz / rf_max). Lowering it increases RF drive.
class RfParameters(BaseModel):
    larmor_frequency_MHz: float = 15.58
    rf_maximum_amplitude_Hze: float = 7661.29
    rf_pi2_fraction: float = 0.6744

### gradients_parameters section
# Hz/m that maps to gradient DAC ±1 (flocra: pulse_Hz_per_m / g_max).
# MRI4ALL Z1 defaults. Lowering these increases gradient current for the same .seq file.
class GradientsParameters(BaseModel):
    gx_maximum: float = 8000000.0
    gy_maximum: float = 9000000.0
    gz_maximum: float = 10000000.0

### shim_parameters section
class ShimParameters(BaseModel):
    shim_x: float = 0.0
    shim_y: float = 0.0
    shim_z: float = 0.0
    shim_mc: List[float] = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]

### marcos_parameters section
class MarcosParameters(BaseModel):
    port: int = 11111
    fpga_clock_frequency_MHz: float = 122.88
    gradient_board_type: str = "gpa-fhdo"
    gpa_fhdo_current_per_volt: float = 2.5
    flocra_pulseq_path: str = "./external/flocra_pulseq"
    # GPA-FHDO SPI setup on connect. Off by default: without a gradient board
    # attached, those first MaRCoS commands close the TCP socket (Broken pipe).
    initialize_gpa: bool = False

##############################################
### main definition of the configuration files

path = Path(runtime.get_base_path()) / "config/config_acq.json"

class Config(BaseModel):
    rf_parameters: RfParameters
    gradients_parameters: GradientsParameters
    shim_parameters: ShimParameters
    marcos_parameters: MarcosParameters

def configCreator():
    config_data = Config(rf_parameters={}, gradients_parameters={}, shim_parameters={}, marcos_parameters={})
    config_data.rf_parameters = RfParameters()
    config_data.gradients_parameters = GradientsParameters()
    config_data.shim_parameters = ShimParameters()
    config_data.marcos_parameters = MarcosParameters()
    return config_data

