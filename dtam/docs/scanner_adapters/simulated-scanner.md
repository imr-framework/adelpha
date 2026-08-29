---
icon: lucide/cpu
---

# Simulated scanner

`SimulatedScannerAdapter` is the Phase 1 development target. It implements the same contract intended for physical scanners later.

## Profile

File: `configs/scanner_profiles/simulated_scanner.yaml`

- Field strength: **0.048 T**
- Architecture: `virtual_halbach`
- Temperature channels: `temp_magnet_01`, `temp_magnet_02`, `temp_room_01`
- Capability highlights: temperature monitoring, B0 monitoring flag, frequency compensation supported, **automatic control false**
- Declared action: `set_center_frequency`

## Behavior

- Generates noisy temperature readings from internal state + Gaussian noise
- Stores ground-truth values in `measurement.metadata["true_value"]` for tests/scenarios
- Requires `connect()` before reads (factory helpers connect by default)
- Temperature injection helpers: `set_temperature_c` / `get_temperature_c` for scenario setup
- Non-temperature channels raise `AcquisitionError` (not synthesized yet)

## Example

```python
from dtam import bootstrap

app = bootstrap(scanner_id="simulated_scanner", environment="testing")
app.adapter.set_temperature_c("temp_magnet_01", 30.0)
batch = app.adapter.read_measurements(["temp_magnet_01"])
print(batch.measurements[0].value, batch.measurements[0].metadata["true_value"])
```

## Why it exists

Simulation-first development lets estimation, agents, safety, and feedback be validated against a virtual twin before Raspberry Pi acquisition or magnet control paths are enabled.
