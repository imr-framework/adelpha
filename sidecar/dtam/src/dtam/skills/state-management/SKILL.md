---
name: state-management
description: Read and update DTAM working-state memory for orchestration without treating it as authoritative scanner truth.
---

# State management

## Rules
- Working state is session/operational scratch space.
- Authoritative scanner measurements come from adapters / twin repositories.
- Prefer keyed namespaces: `orchestrator.*`, `thermal.*`, `magnet.*`.

## Steps
1. `list_working_state_keys` for relevant prefixes.
2. `get_working_state` for required keys.
3. `set_working_state` after each major milestone.
