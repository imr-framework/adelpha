---
title: Adelpha MRI research, validation, and publications
description: "How to treat Adelpha MRI in papers: what is implemented, what is simulated, and how to cite the software without implying clinical validation."
icon: lucide/flask-conical
---

# Research, validation, and publications

Adelpha MRI is an **open research platform**. This page states what you can honestly write in a methods section today. It does not invent a clinical trial or a phantom benchmark that is not in the repository.

## What you can claim from the code

| Claim | Basis |
| --- | --- |
| Desktop observer + operator for low-field MRI | Tauri app, three workspaces |
| Twin state with explicit provenance | DTAM `QuantitySource` on timestamped quantities |
| Thermal → \(B_0\) model with configurable \(\alpha_T\) | `dtam` models + `configs/models.yaml` |
| Optional thermal PINN forecast | Artifact in `dtam/data/models/pinn/` when trained |
| MRI4ALL sequence/recon path on desktop | FastAPI façade + in-process pipeline |
| MaRCoS ping and bitstream helpers | `marcos_boot.py`, TCP 11111 |

## What you should not claim

- That Adelpha MRI is a **medical device**, or that images are for diagnosis.
- That EMI/RF twin channels are **calibrated EMC measurements**.
- That PINN predictions are **validated** against a published phantom study in this repo — they are an optional estimator with a fallback heating rate.
- That systemd acq/recon Start/Stop on System Status works on macOS (they stay Unknown).
- That the FALLBACK sequence catalog is the same as a fully imported `SequenceBase` environment.

If you run a validation, publish the protocol, raw data, and software commit hash. This documentation will not pre-write your results.

## Citing the software

Use [`CITATION.cff`](https://github.com/imr-framework/adelpha/blob/main/CITATION.cff) and the [Citation and licensing](citation.md) page. Cite **MRI4ALL** separately when the console or sequences are material to the work. Cite **MaRCoS** / Red Pitaya when hardware I/O is material.

## Related public materials

- MRI4ALL console overview (upstream): [YouTube](https://www.youtube.com/watch?v=8GNmocJP-14)
- DTAM in-tree docs (developer): `dtam/docs/` — twin math, PINN, Twin API
- Adelpha operator docs: this site

When a peer-reviewed Adelpha MRI paper exists, add the DOI here. Until then, cite the software version from GitHub Releases (for example the installer version shown on [Download](../start/download.md)).
