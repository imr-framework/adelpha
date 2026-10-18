---
icon: lucide/radar
---

# Observability

## Structured logging

`dtam.observability.logging.configure_logging` configures stdlib logging plus structlog processors.

```python
from dtam.observability import configure_logging, get_logger, bind_correlation_id

configure_logging()  # or pass LoggingConfig
log = get_logger("dtam.example")
bind_correlation_id("...")
log.info("event_name", scanner_id="simulated_scanner")
```

Bootstrap applies the logging section from merged runtime settings automatically.

## Structured errors

`dtam.core.exceptions.DtamError` and subclasses carry:

- `code`, `message`, `severity`, `recoverability`
- optional `scanner_id`, `correlation_id`, `context`, `recommended_response`
- UTC `timestamp`
- `to_dict()` for logging / audit serialization

Examples: `ConfigurationError`, `AcquisitionError`, `SensorUnavailableError`, `SafetyViolationError`, `ApprovalRequiredError`, …

!!! note
    Metrics, tracing, and audit packages under `observability/` are still placeholders beyond logging.
