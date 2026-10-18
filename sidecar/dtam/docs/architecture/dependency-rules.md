---
icon: lucide/git-branch
---

# Dependency rules

Dependency direction must preserve a portable domain:

``` text
Interfaces and agents
        ↓
Application services and workflows
        ↓
Tools and domain interfaces
        ↓
Domain models
        ↑
Infrastructure implementations
```

## Domain must not import

These belong in infrastructure / orchestration only:

- `google.adk`
- FastAPI and web frameworks
- PostgreSQL / Redis / MQTT clients
- Raspberry Pi device libraries
- Gemini / OpenAI SDKs

Phase 1 largely obeys this: `dtam.domain` and `dtam.config` are free of ADK imports. The root agent module under `dtam.agents` is where Google ADK is expected. The FastAPI twin surface lives in `dtam.api` and must not be imported by domain or twin estimators.

## Adapter boundary

```python
from dtam.scanner_adapters import create_scanner_adapter
from dtam.config import load_runtime_settings

settings = load_runtime_settings(scanner_id="simulated_scanner")
adapter = create_scanner_adapter(settings)
```

Callers depend on `ScannerAdapter`, not on Pi/serial/SDR drivers. Physical drivers will sit behind adapters and acquisition packages later.
