---
icon: lucide/magnet
---

# Halbach 48 mT adapter

The first physical deployment profile is `halbach_48mt`. In Phase 1 this adapter is a **profile and capability surface**, not a live hardware driver.

## Profile

File: `configs/scanner_profiles/halbach_48mt.yaml`

- Architecture: `permanent_magnet_halbach`
- Field strength: **0.048 T**
- Capabilities include temperature, B0, EMI, gradient monitoring flags, RF tuning control, frequency compensation, sequence adaptation
- **`automatic_control: false`**
- `active_shimming: false`

## Phase 1 behavior

`Halbach48mTAdapter`:

- loads and exposes the validated profile
- lists sensors/actuators from config
- defaults to `READ_ONLY` mode
- **raises `ConfigurationError` on `connect()` and `read_measurements()`**

This is intentional. Use `SimulatedScannerAdapter` until Phase 6 physical acquisition work lands.

## Helpers

```python
from dtam.scanner_adapters.halbach_48mt import (
    load_halbach_48mt_profile,
    halbach_48mt_capabilities,
)

profile = load_halbach_48mt_profile()
caps = halbach_48mt_capabilities()
```

Channel naming maps for future hardware glue live in `halbach_48mt/mappings.py` (logical DTAM ids → site hardware labels).

!!! tip
    Treat Halbach as a **deployment profile**. DTAM core must remain usable if this folder is replaced by another adapter.
