# DTAM agents — multi-agent MRI digital twin layer

Research-only multi-agent system for DTAM, built on
[Google ADK](https://google.github.io/adk-docs/).

**Not** clinically validated, **not** regulatorily approved, and **does not**
control real scanner hardware.

This package lives at `dtam.agents` inside the DTAM monorepo. It adds a
**deterministic assessment core** (routing, specialists, safety) on top of the
existing twin / tools / skills stack — it does **not** replace
`dtam.digital_twin` or `dtam.tools`.

## Layers

| Layer | Role |
| --- | --- |
| Twin physics | `dtam.digital_twin` + scanner adapters (source of measured/estimated/predicted state) |
| Tools & skills | `dtam.tools` + `dtam.skills` (adapter reads, PINN, Halbach, EMI classify, …) |
| Assessment core | `dtam.agents.core` — `run_assessment`, routing, policies |
| ADK wrappers | Thin LLM agents that call assessment tools + skill toolsets |

Governing principle: **autonomous reasoning, deterministic safety validation,
graph-governed execution.** Specialists may propose; they must not execute
scanner control.

## ADK entry

```bash
make web   # uv run adk web src  →  dtam.agent:root_agent (dtam_supervisor)
make api   # ADK API server
```

Root tools:

- Orchestrator skill toolset (`estimate_twin_state`, PINN, knowledge, …)
- `assess_digital_twin(observation_json, mode)` — JSON observation pipeline
- `assess_from_twin_scanner(scanner_id, mode)` — live twin → assessment bridge

The same deterministic assessment is also on the Twin HTTP API:

- `POST /assess` — observation JSON
- `POST /assess/from-twin` — live adapter twin → assessment

See [Twin HTTP API](../../../../docs/platform/twin-api.md) (`make twin-api`).

Sub-agents: `thermal_agent`, `magnet_agent`, `emi_agent`, `rf_agent`,
`b1_agent`, `gradient_agent`, `motion_tracking`, `safety_agent`.

## Deterministic CLI (no LLM)

```bash
uv run python -m dtam.agents.main --input src/dtam/agents/examples/normal_state.json
uv run python -m dtam.agents.main --input src/dtam/agents/examples/thermal_drift.json --mode recommend
uv run python -m dtam.agents.main --from-twin --scanner-id simulated_scanner --json
```

## Twin bridge

`dtam.agents.core.twin_bridge` maps `SystemState` → `DigitalTwinObservation`
so assessment can consume the physics twin without forking state models.

## Environment

Copy `src/dtam/agents/.env.example` values into the repo-root `.env` (never
commit secrets). Non-secret knobs use `DT_*` prefixes (see
`dtam.agents.core.config`).

## Tests

```bash
uv run pytest tests/unit/agents -q
```

Includes specialist smoke imports, twin bridge, and the assessment suite under
`tests/unit/agents/assessment/`.

## Safety

Deterministic allowlist/bounds/confidence gate in `core/policies.py`. Hardware
control action types are always rejected. `act` mode stays disabled unless
`DT_ENABLE_SIMULATED_ACT_MODE=true` (simulation stub only).

## What not to do

- Do not import ADK from `dtam.domain` / `dtam.digital_twin` / `dtam.api`
- Do not replace `dtam.tools` with `agents/core/tools` (assessment numerics only)
- Do not treat LLM output as scanner truth — prefer twin estimators and tools
