---
name: temp-measurement
description: Acquire and summarize scanner temperature channels.
---

# Temperature measurement

## Steps
1. Call `read_temperature_channels` for the active scanner profile (default simulated).
2. Verify validity flags.
3. Cache results are written to working state automatically.
