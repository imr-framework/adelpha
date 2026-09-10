---
title: Adelpha MRI reconstruction architecture
description: "Reconstruction modes in Adelpha MRI: bypass, fake DICOMs, basic 3D, Cartesian FFT, optional B0 correction, ISMRMRD, and the in-process worker that replaces systemd."
icon: lucide/image
---

# Reconstruction architecture

Reconstruction is still the MRI4ALL Python stack. Adelpha MRI runs it **in-process** on the desktop so macOS and Windows can reconstruct without systemd.

## Pipeline versus MRI4ALL services

| MRI4ALL | Adelpha desktop |
| --- | --- |
| `services.recon.main` as a systemd unit | **Do not import** that module in the sidecar |
| stdout redirected, Linux-oriented | `console/services/api/pipeline.py` polls the folder queue |
| Start/Stop on System Status maps to systemd | On Mac, service status stays **Unknown** |

The worker sets `_recon_enabled` and processes tasks whose state is `scheduled_recon` / `recon`. Acquisition is a sibling thread in the same pipeline (`_acq_enabled`). Both share `common.queue` and `ScanTask`.

## Modes in `run_reconstruction`

`console/services/recon/reconstruction.py` branches on `task.processing`:

| `recon_mode` / trajectory | Behavior |
| --- | --- |
| `bypass` | Log and return; sequence may already have plotted FID internally |
| `fake_dicoms` | `utils.generate_fake_dicoms` for UI/demo without k-space |
| `basic3d` | 3D only; loads PE order from `RAWDATA` / `PE_ORDER` |
| `trajectory == cartesian` | Cartesian reconstruction (`run_reconstruction_cartesian`) |
| anything else | Error: unknown trajectory |

Optional imports (log a warning and continue if missing):

| Module | Role |
| --- | --- |
| `recon.B0Correction.B0Corrector` | Cartesian \(B_0\) correction |
| `recon.ismrmrd.numpy_to_ismrmrd` | ISMRMRD writer |
| `recon.image_filters.denoise` | Image denoising |

Core k-space path uses `recon.kspaceFiltering` and writes DICOM via `recon.DICOM.DICOM_utils`.

## What the operator sees

Study Viewer and Flex Viewer consume reconstructed results from the MRI4ALL data tree, not from a separate Adelpha image server. **Processing** tabs on a scan set `recon_mode` and trajectory the same way the Qt console did.

Logs: hamburger **Control → Log Viewer** has Reconstruction as a stream. Twin API docs also list `GET /logs/{acq|recon|ui|api}` on the MRI façade.

This is **research reconstruction** (FFT, optional filters, hackathon-era paths). It is not a cleared clinical recon pipeline. See [Intended use](intended-use.md).
