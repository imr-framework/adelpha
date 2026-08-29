---
name: coil-sensor-measurement
description: Read RF coil matching / loading observables for B1 reasoning.
---

# Coil sensor measurement

## Steps
1. Call `read_coil_sensor` with forward/reflected power inputs when known.
2. Interpret tuning_ok / return_loss_db.
3. Persist findings via working state (tool writes `b1.last_coil_sensor`).
