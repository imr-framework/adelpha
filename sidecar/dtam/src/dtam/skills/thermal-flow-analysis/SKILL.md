---
name: thermal-flow-analysis
description: Analyze thermal gradients and forecast simple thermal mixing dynamics.
---

# Thermal flow analysis

## Steps
1. Gather channel values (`read_temperature_channels` or prior state).
2. Call `analyze_thermal_gradient`.
3. Call `simulate_thermal_flow` for short-horizon advisory forecasts.
4. For user-facing forecast / prediction questions, call `plot_twin_forecast` and explain the thermal + f0 curves (predicted ≠ measured).
5. Relate thermal drift to possible B0/frequency impact qualitatively.
