---
title: Pulse-sequence and protocol management in Adelpha MRI
description: How Adelpha MRI lists MRI4ALL sequences, validates parameters, queues scans through scan.json, and stores protocols for the open exam.
icon: lucide/list
---

# Pulse-sequence and protocol management

Sequences in Adelpha MRI are MRI4ALL **plugins**, not a new pulse-sequence language. The Imaging Console lists them, edits parameters, and writes the exam queue. Python `SequenceBase` still builds the waveform.

## Adding inputs from Python

The Imaging Console SEQUENCE / ADJUSTMENTS / SYSTEM / PROCESSING / OTHER tabs are filled from Python. You do not write TypeScript or a Qt ``.ui`` file.

Name every operator field ``param_<Name>``. ``param_TE`` becomes the **TE** box. Known names (TE, TR, FOV, …) pick up units from a shared table. Anything else still appears as a number, checkbox, or text field.

```python
from sequences import PulseqSequence, param
from pathlib import Path

class MySequence(PulseqSequence, registry_key=Path(__file__).stem):
    param_TE: int = 10          # SEQUENCE tab, unit ms (known name)
    param_TR: int = 250
    param_coarse_steps = param(
        100,
        title="Coarse steps",
        tab="adjustments",      # or sequence / system / processing / other
        minimum=1,
        description="Points in the first search",
    )
    param_mode = param("fast", enum=["fast", "slow"], tab="other")
```

``param()`` sets label, unit, tab, min/max, dropdown ``enum``, and optional help text. After you save the file, restart the Python runtime so the sequence catalog reloads.

If you do **not** implement ``get_default_parameters`` / ``get_parameters`` / ``set_parameters``, Adelpha copies the ``param_*`` values for you. Existing sequences that still map those methods by hand keep working.

Optional overlay without converting an attribute to ``param()``:

```python
parameter_ui = {"N_ITER": {"title": "Iterations", "tab": "adjustments", "minimum": 1}}
```

See ``console/sequences/adj_frequency_snr.py`` for a sequence that exposes search controls on the ADJUSTMENTS tab this way.

## Catalog the GUI sees

`console/services/api/sequences_api.py` loads `SequenceBase` when the MRI4ALL environment is complete. If numba / numpy pins block that import (the desktop sidecar uses **numpy 2**), the façade serves a **FALLBACK** catalog so the UI still lists sequences:

| id | Name |
| --- | --- |
| `rf_se` | RF Spin-Echo |
| `tse_3D` | 3D Turbo Spin-Echo |
| `tse_2D` | 2D Turbo Spin-Echo |
| `gre_3D` | 3D Gradient Echo |
| `se_2D` | 2D Spin-Echo |

Plugin sources live in `console/sequences/` (for example `se_2D.py`). Parameter schema comes from `common.parameter_schema.schema_for_defaults`. Validate with the façade’s validate route before Prepare.

!!! warning "Fallback vs hardware"
    A sequence that appears in FALLBACK is a **catalog stub** with defaults. Running it on a board still requires the real `SequenceBase` module and a MaRCoS path. See [Packaging limitations](../packaging/limitations.md).

## Exam queue

```mermaid
flowchart TD
  A[Patient Registration] --> B[Open exam in memory]
  B --> C[Sequence list: add / rename / duplicate / delete]
  C --> D[Parameter tabs: SEQUENCE ADJUST SYSTEM PROCESSING OTHER]
  D --> E[Prepare writes scan.json into PREPARED]
  E --> F[In-process pipeline runs SequenceBase]
```

Restarting the MRI API **clears the in-memory exam**. Protocols in the hamburger menu (**Exam → protocols**) are MRI4ALL protocol browser flows, rehosted in the React shell. Right-click on the sequence list to rename, duplicate, or delete entries for the open exam.

## What stays on disk

| Path class | Role |
| --- | --- |
| App data `mri4all/` | Packaged exam / raw / DICOM tree |
| `scan.json` + `PREPARED` | Same contract as MRI4ALL |
| Sequence Python files | Not edited by the GUI |

The TypeScript client talks only to `/api/mri` (desktop: supervisor gateway + session token). It never opens the Red Pitaya socket. Operator steps: [Imaging Console](../guide/imaging-console.md). Hardware: [MaRCoS](marcos.md).
