---
icon: lucide/shield
---

# Operational modes

`OperationalMode` is defined in `dtam.domain.modes` and is part of runtime settings / adapter state.

| Mode | Value | Notes |
| --- | --- | --- |
| Simulation | `simulation` | Default for Phase 1 |
| Read only | `read_only` | Observe without advising control |
| Advisory | `advisory` | Recommend; do not actuate physical hardware |
| Supervised control | `supervised_control` | Mutating actions with human gating |
| Autonomous control | `autonomous_control` | Requires explicit deployment enablement |
| Emergency stop | `emergency_stop` | Safe halt path |
| Maintenance | `maintenance` | Service operations |
| Calibration | `calibration` | Calibration workflows |

Helpers on the enum:

```python
mode.allows_physical_mutation()
mode.allows_simulated_mutation()
```

Physical mutation is allowed only for supervised, autonomous, maintenance, and calibration modes. Simulated mutation is additionally allowed in `simulation`.

!!! danger "Default posture"
    Mutating physical operations must be rejected in `simulation`, `read_only`, and `advisory` unless the target is the virtual scanner. Autonomous control must not be the default deployment setting.
