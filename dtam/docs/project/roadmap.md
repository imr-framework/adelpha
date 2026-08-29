---
icon: lucide/map
---

# Roadmap

Phased plan matching the project brief.

## Phase 1 — Foundation

Configuration, domain entities, typed measurements, capability profiles, base + simulated adapters, structured logging, tests. **Done.**

## Phase 2 — Thermal and \(B_0\) digital twin

Virtual temperatures → thermal state → thermal estimator → magnetic state → \(B_0\) drift model → sync/uncertainty. **Done.** See [Digital twin](../digital_twin/index.md).

## Phase 3 — Initial agent team

Root, observation, thermal, magnetic-field, diagnosis, safety, reporting agents (thin ADK orchestration over tools).

## Phase 4 — Advisory workflow

Monitor → estimate → diagnose → predict → recommend → report. No physical actuation.

## Phase 5 — Simulated closed loop

Frequency compensation on the virtual scanner with safety checks, command schema, response validation, twin update.

## Phase 6 — Physical acquisition

Raspberry Pi temperature gateway, Ethernet transport, calibration, persistence — behind the Halbach adapter.

## Phase 7+ — Broader subsystems and supervised control

EMI, RF tuning, gradients, image quality; then approved low-risk reversible hardware actions; later adaptation and richer uncertainty.

## Non-goals for early versions

- Fully controlling a clinical scanner
- Autonomously executing high-risk MRI actions
- Replacing certified scanner safety systems
- Claiming regulatory/clinical readiness
- Putting LLMs in the real-time hardware-control loop
- Using unstructured agent text as actuator commands
