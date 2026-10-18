---
name: b0-map-generation
description: Generate or summarize B0 field maps for twin and diagnosis workflows.
---

# B0 map generation

## Steps
1. Prefer designer/FEM-derived maps when available.
2. Otherwise call `generate_b0_map_summary` for an advisory synthetic map artifact.
3. Store path and statistics in working state.
4. Distinguish synthetic summaries from measured field maps.
