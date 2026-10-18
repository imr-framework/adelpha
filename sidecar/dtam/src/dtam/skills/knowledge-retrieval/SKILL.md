---
name: knowledge-retrieval
description: Search local knowledge bases for procedures, EMI mitigations, thermal guidance, and magnet notes.
---

# Knowledge retrieval

## Steps
1. Choose the domain folder (`orchestrator`, `emi`, `thermal`, `magnet`, `b1`, `gradient`).
2. Call `search_knowledge` (orchestrator) or domain-specific search tools.
3. Cite file paths from hits when recommending actions.
4. If no hits, say so explicitly and request new knowledge documents under `data/knowledge/`.
