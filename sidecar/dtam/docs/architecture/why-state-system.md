---
icon: lucide/circuit-board
---

# Why a state system?

DTAM represents the MRI scanner twin as a **state system**: a versioned snapshot \(x(t)\) assembled from subsystem states (thermal, magnetic, EMI, RF, …), updated from measurements, and optionally forecast forward in time.

This page records why that choice is deliberate — and where it can go wrong.

## Verdict

For an MRI digital twin, a **state-system representation** is the right core abstraction. It matches how scanners and physics actually work, and it scales better than “a pile of sensor readings” or “whatever the LLM last said.”

## Why it fits MRI

An MRI system is not one signal. It is coupled subsystems with **hidden state** that sensors do not observe perfectly:

- thermal → remanence / \(B_0\) / \(f_0\)
- EMI / RF noise → SNR and usability
- (later) gradients, \(B_1\), image quality

Treating that as \(x(t)\) updated from measurements \(y(t)\) is the standard digital-twin pattern:

```text
estimate → predict → (eventually) control
```

DTAM’s `SystemState` and estimators encode exactly that loop. See [Architecture](index.md) and [System map](system-map.md).

## What DTAM got right

| Choice | Why it matters |
| --- | --- |
| **Subsystem states** (`thermal`, `magnetic`, `emi`, `rf`) | Avoids one flat blob; maps cleanly to physics and UI panels |
| **Provenance** (`measured` / `estimated` / `predicted` / `nominal`) | GUI and agents must not confuse forecast with truth |
| **Twin service as updater** | Scientific truth stays in estimators/models; agents and the HTTP API are consumers |
| **Versioned snapshot** (`twin_version`, timestamps, correlation ids) | Auditability, debugging, and safe evolution of the schema |

That is wiser than a pure agent-memory model or a dashboard that only charts raw sensors.

## Where “state system” can go wrong

The abstraction becomes harmful only if it is over-formalized too early:

- Full Kalman / PDE / FEM state for everything before there is data
- Pretending gradient or image-quality packages are “state” when they are empty stubs
- Letting agents mutate state directly instead of calling estimators / tools
- Treating the composite `SystemState` as *the* physics model rather than a **snapshot interface** over models

The current slice — thermal→\(B_0\), EMI/RF aggregates, optional thermal PINN forecast — is the right level of ambition. See [Status](../start/status.md) and [Thermal PINN](../digital_twin/thermal-pinn.md).

## Practical consequences

1. **APIs return state**, not ad-hoc chart series — e.g. [`SystemState` via the Twin HTTP API](../platform/twin-api.md).
2. **UI must surface `source`** on every `TimestampedQuantity` (measured vs estimated vs predicted).
3. **New subsystems** join as new state objects + estimators, not as one-off endpoints with unrelated shapes.
4. **Control** (when it lands) will act on validated commands informed by state — not by rewriting `SystemState` from the LLM.

## Bottom line

Representing the scanner twin as a **state system** is sound engineering for MRI. The important discipline is: **state is the product of physics estimators**, not a chat transcript.

The equations behind \(x_T\), \(x_B\), EMI/RF heuristics, and thermal forecast are collected in [Mathematical models](../digital_twin/mathematical-models.md).
