---
icon: lucide/gauge
---

# Measurements

Typed measurements are the foundation for acquisition and twin updates.

## `Measurement`

Each measurement records:

| Field | Purpose |
| --- | --- |
| `measurement_id` | Unique id (UUID by default) |
| `sensor_id` | Channel identifier |
| `scanner_id` | Scanner identity |
| `timestamp` | Observation time (timezone-aware UTC in the simulator) |
| `quantity` | `QuantityKind` enum |
| `value` / `unit` | Numeric reading with explicit unit string |
| `calibration_version` | Optional calibration tag |
| `uncertainty` | Optional non-negative std-dev style uncertainty |
| `acquisition_quality` | Optional quality in \([0, 1]\) |
| `validity` | `valid`, `suspect`, `invalid`, or `missing` |
| `provenance` | Source / method / version |
| `metadata` | Free-form extras (simulator stores `true_value`) |

`is_usable` is true for `valid` and `suspect` readings.

## `MeasurementBatch`

A batch groups measurements over a time window with a `correlation_id` for tracing.

```python
batch = adapter.read_measurements()
usable = batch.usable()
channel = batch.by_sensor("temp_magnet_01")
```

## Validity

``` text
VALID    — acceptable for estimation
SUSPECT  — usable with caution
INVALID  — must not drive decisions
MISSING  — expected channel absent
```

Agents and estimators (when added) should treat validity as a first-class signal, not filter it away silently.
