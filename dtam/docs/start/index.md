---
icon: lucide/rocket
---

# Getting started

## Requirements

- Python 3.10+ (repository pin: `.python-version`)
- [`uv`](https://docs.astral.sh/uv/) for environments and dependencies

## Install

```bash
uv sync --all-groups
```

This installs runtime dependencies and the `dev` group (`pytest`, `ruff`, `mypy`, `zensical`, …).

## Run the foundation smoke path

```bash
uv run dtam
```

`dtam` calls `bootstrap()` with the development defaults:

| Setting | Default |
| --- | --- |
| Environment | `development` |
| Scanner | `simulated_scanner` |
| Mode | `simulation` |

The process loads config from `configs/`, configures structured logging, connects the simulated adapter, reads temperature channels, and prints a short status line.

### Bootstrap from Python

```python
from dtam import bootstrap

app = bootstrap(
    scanner_id="simulated_scanner",
    environment="testing",
)
batch = app.adapter.read_measurements()
print(batch.scanner_id, len(batch.measurements), batch.correlation_id)
```

Override the config directory with `DTAM_CONFIG_DIR` or `config_root=` on `bootstrap()` / `load_runtime_settings()`.

## Tests

```bash
# Foundation suite used during Phase 1
uv run pytest tests/unit tests/integration/test_foundation_bootstrap.py -q

# Full tree (most folders are still scaffolding)
make test
```

Quality gates:

```bash
make lint
make typecheck
make check   # lint + typecheck + test
```

## Development servers

```bash
make twin-api    # FastAPI twin REST API (GUI telemetry) → :8080
make agents-api  # ADK api_server for GUI chat → :8001 (Vite/Next CORS)
make web         # ADK web UI on :8001 (same CORS allowlist)
make api         # uv run adk api_server src (ADK default port)
```

- Twin GUI API: [Twin HTTP API](../platform/twin-api.md)
- Google ADK entry points for agent UIs (`dtam_supervisor` + specialists)

## Documentation site

This site is built with [Zensical](https://zensical.org/docs/):

```bash
make docs        # uv run zensical build --strict
make docs-serve  # local preview
```

See [Docs site](../project/docs-site.md) for configuration details.
