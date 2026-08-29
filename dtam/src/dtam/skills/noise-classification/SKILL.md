---
name: noise-classification
description: Classify EMI interference patterns from sensor summaries.
---

# Noise classification

## Steps
1. Call `read_emi_sensor_summary` (or use provided metrics).
2. Call `classify_emi_noise` with peak frequency and RMS.
3. Report label and confidence limitations (heuristic until ML models exist).
