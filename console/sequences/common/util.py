import json
from sequences.common.pydanticConfig import Config, configCreator
from common import runtime
from pathlib import Path

path = Path(runtime.get_base_path()) / "config/config_acq.json"


def reading_json_parameter():
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        configuration_data = configCreator()
        with open(path, "w") as outFile:
            outFile.write(
                json.dumps(configuration_data.model_dump(mode="json"), indent=4)
            )

    with open(path) as file:
        data = json.load(file)
        configuration_data = Config(**data)

    clock = configuration_data.marcos_parameters.fpga_clock_frequency_MHz
    if abs(clock - 122.8) < 0.001:
        configuration_data.marcos_parameters.fpga_clock_frequency_MHz = 122.88
        writing_json_parameter(configuration_data)

    return configuration_data


def writing_json_parameter(config_data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as outFile:
        outFile.write(json.dumps(config_data.model_dump(mode="json"), indent=4))
        outFile.flush()
