---
icon: lucide/cable
---

# Adapters

Adapters isolate scanner-specific behavior behind a shared contract: `ScannerAdapter` in `dtam.scanner_adapters.base`.

## Contract

Adapters expose:

- identity / profile / capabilities
- `connect` / `disconnect` / `is_connected`
- operational mode get/set
- sensor and actuator inventories
- `supports_action(action_type)`
- `read_measurements(channel_ids=None) → MeasurementBatch`

``` mermaid
classDiagram
  class ScannerAdapter {
    <<abstract>>
    +identity
    +capabilities
    +connect()
    +read_measurements()
  }
  class SimulatedScannerAdapter
  class Halbach48mTAdapter
  ScannerAdapter <|-- SimulatedScannerAdapter
  ScannerAdapter <|-- Halbach48mTAdapter
```

## Factory

```python
from dtam.scanner_adapters import create_scanner_adapter
from dtam.config import load_runtime_settings

settings = load_runtime_settings(scanner_id="simulated_scanner")
adapter = create_scanner_adapter(settings)
```

| Profile id / architecture | Adapter |
| --- | --- |
| `simulated_scanner` or `architecture` starting with `virtual` | `SimulatedScannerAdapter` (auto-connects) |
| `halbach_48mt` | `Halbach48mTAdapter` |
| anything else | `ConfigurationError` |

## Pages

- [Simulated scanner](simulated-scanner.md)
- [Halbach 48 mT](halbach-48mt.md)
