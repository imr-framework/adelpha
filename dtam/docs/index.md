---
icon: lucide/activity
---

# DTAM

**DTAM** (Digital Twin Architecture for MRI) is a reusable, modular, physics-informed digital twin architecture for magnetic resonance imaging systems.

It is intended to be adapted to different MRI platforms — low-field research systems, portable magnets, Halbach arrays, clinical 1.5 T scanners, 3 T research systems, and future experimental hardware — through **scanner adapters**, not by rewriting the core.

!!! quote "Mission"
    Sense scanner behavior, estimate hidden system state, diagnose abnormalities, predict future conditions, optimize interventions, enforce deterministic safety, and learn from closed-loop feedback — without hard-coding a single magnet into the architecture.

## What exists today

DTAM is at **Phase 1: Foundation**. You can:

- load layered YAML configuration and scanner capability profiles
- instantiate a **simulated scanner** that emits typed temperature measurements
- inspect a profile-backed **48 mT Halbach** adapter (physical I/O not enabled)
- bootstrap logging, settings, and an adapter from one call
- run unit and foundation integration tests

The first intended vertical slice after Foundation is thermal monitoring → \(B_0\) drift estimation → multi-agent diagnosis → safe frequency-compensation planning → simulated closed-loop validation.

## Quick start

```bash
uv sync --all-groups
uv run dtam
uv run pytest tests/unit tests/integration/test_foundation_bootstrap.py -q
```

``` text
DTAM ready scanner=simulated_scanner mode=simulation sensors=3 measurements=3 ...
```

Preview this documentation site:

```bash
make docs-serve
```

## Intended closed loop

``` mermaid
flowchart TD
  A[Physical or virtual MRI] --> B[Sensor and operational data]
  B --> C[Synchronization and validation]
  C --> D[Digital-twin state estimation]
  D --> E[Multi-agent reasoning]
  E --> F[Prediction and optimization]
  F --> G[Deterministic safety validation]
  G --> H[Control or intervention]
  H --> I[Post-action monitoring]
  I --> J[Twin sync and model adaptation]
  J --> B
```

Advisory mode recommends actions without changing hardware. Closed-loop and autonomous control are **not defaults** and must be enabled only through explicit deployment configuration.

## Where to go next

| Section | Start here |
| --- | --- |
| [Getting started](start/index.md) | Install, CLI, tests |
| [Status](start/status.md) | Implemented vs scaffolded packages |
| [Architecture](architecture/index.md) | System identity and boundaries |
| [Adapters](scanner_adapters/index.md) | Simulated and Halbach profiles |
| [Roadmap](project/roadmap.md) | Phased development plan |
| [GitHub](https://github.com/LeoMcBills/dtam/tree/main) | Source code on `main` |
