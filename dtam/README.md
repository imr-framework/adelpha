<div align="center">

# DTAM

![Python](https://img.shields.io/badge/python-v3.10+-blue.svg)
![Google ADK](https://img.shields.io/badge/Google%20ADK-Latest-green.svg)
![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue.svg)
![Development Status](https://img.shields.io/badge/status-Alpha-yellow.svg)

</div>

**Digital Twin Architecture for MRI** — physics-informed, agentic infrastructure for MRI digital twins.

Full documentation lives in [`docs/`](docs/) (preview with `make docs-serve`). This README covers how to run the project locally.

## Requirements

- Python 3.10+
- [uv](https://docs.astral.sh/uv/)

## Install

```bash
uv sync --all-groups
```

## Smoke test

```bash
uv run dtam
```

Example output:

```text
DTAM ready scanner=simulated_scanner mode=simulation sensors=3 measurements=3 ...
```

## Servers
Run the following servers (use different terminals for each).
These servers also directly serve `Adelpha` if you are using it for you digital twin GUI.

```bash
make twin-api
make agents-api
```

### Other servers
```bash
make web
make api
```

Details: [Twin HTTP API](docs/platform/twin-api.md), [Getting started](docs/start/index.md).

## Tests and checks

```bash
uv run pytest tests/unit tests/integration/test_foundation_bootstrap.py -q
make test
make lint
make typecheck
make check
```

## Docs site

```bash
make docs-serve
```

## AI models
For agent / Gemini calls, set a Google API key in the repo-root `.env` (see `src/dtam/agents/.env.example`):

```bash
GOOGLE_API_KEY=your-key-here
```

## Optional extras

```bash
# Thermal PINN training (see docs/digital_twin/thermal-pinn.md)
uv sync --extra pinn
uv run --extra pinn python -m dtam.digital_twin.models.thermal.pinn.train \
  --epochs 200 --out data/models/pinn

# Vendor HalbachMRIDesigner for magnet design CLI (see THIRD_PARTY.md)
make vendor-halbach
```

## Links

- Docs: [`docs/`](docs/) · Site config: `zensical.toml`
- Repository: https://github.com/LeoMcBills/dtam
- License: MIT ([`LICENSE`](LICENSE)) · Third-party: [`THIRD_PARTY.md`](THIRD_PARTY.md)
