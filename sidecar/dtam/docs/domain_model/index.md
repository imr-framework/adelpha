---
icon: lucide/shapes
---

# Domain model

The domain layer lives in `src/dtam/domain/` and holds portable MRI concepts: units, measurements, scanner identity, and operational modes.

## Package map (Phase 1)

| Module | Contents |
| --- | --- |
| `dtam.domain.modes` | `OperationalMode` |
| `dtam.domain.measurements` | `Measurement`, `MeasurementBatch`, validity, provenance |
| `dtam.domain.value_objects` | Temperature, field strength, frequency, uncertainty |
| `dtam.domain.entities.scanner` | Capabilities, sensor/actuator descriptors, identity |
| `dtam.domain.exceptions` | Domain invariant errors |

Import the public surface from `dtam.domain`:

```python
from dtam.domain import (
    Measurement,
    OperationalMode,
    ScannerCapabilities,
    Temperature,
    FieldStrength,
    Frequency,
)
```

## Design rules

- Prefer **explicit units** over bare floats.
- Never silently mix **measured**, **estimated**, and **predicted** quantities (estimation layers come in Phase 2+).
- Keep scanner field strength and channel counts in configuration, not hard-coded constants (except universal physics constants such as \(\gamma/2\pi\)).

See also:

- [Measurements](measurements.md)
- [Value objects](value-objects.md)
- [Operational modes](../architecture/operational-modes.md)
