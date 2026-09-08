---
title: Cite and license Adelpha MRI
description: How to cite Adelpha MRI, SPDX and license split among the MIT desktop/DTAM trees and the GPL-3 MRI4ALL console.
icon: lucide/scale
---

# Citation and licensing

## Cite Adelpha MRI

Repository: [github.com/imr-framework/adelpha](https://github.com/imr-framework/adelpha)

Machine-readable citation: [`CITATION.cff`](https://github.com/imr-framework/adelpha/blob/main/CITATION.cff) at the repository root (GitHub renders a “Cite this repository” button from that file).

Example:

> Adelpha contributors & Accessible Magnetic Resonance Laboratory. *Adelpha MRI* (Version X.Y.Z) [Computer software]. https://github.com/imr-framework/adelpha

Replace **X.Y.Z** with the [release](https://github.com/imr-framework/adelpha/releases) you actually ran. Documentation: [https://imr-framework.github.io/adelpha/](https://imr-framework.github.io/adelpha/).

Also cite upstream when you used it:

| Component | Cite |
| --- | --- |
| Imaging console / sequences / recon | MRI4ALL Zeugmatron Z1 console, [github.com/mri4all/console](https://github.com/mri4all/console) |
| Board server / FPGA extras | MaRCoS, vendored under `console/external/` |
| Twin physics / Twin API | DTAM tree at `dtam/` (MIT) |

## License split

| Path | License | File |
| --- | --- | --- |
| Desktop UI, Tauri, most of the repo | MIT | [`LICENSE`](https://github.com/imr-framework/adelpha/blob/main/LICENSE) |
| `dtam/` | MIT | `dtam/LICENSE` |
| `console/` | GNU GPL v3 | `console/LICENSE` |

Copyright on the MIT `LICENSE` is **iMR Framework** (2026). GPL-3 applies to the MRI4ALL-derived console regardless of the outer MIT file.

!!! warning "Installers"
    A public Adelpha MRI installer that includes the imaging console is a **GPL-3 distribution of that Python runtime**. Corresponding source must be available. DTAM remaining MIT does not relicense the console. See [Packaging limitations](../packaging/limitations.md).

## Third-party and secrets

Do not bundle `.env`, Google API keys, or signing certificates. Agents require a user-provided `GOOGLE_API_KEY`. Numpy 2 in the sidecar means some MRI4ALL numba 1.x sequence imports use the HTTP FALLBACK catalog.

Intended-use statement: [Intended use](intended-use.md).
