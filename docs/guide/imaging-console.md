---
title: Adelpha MRI Imaging Console
description: Register MRI examinations, queue pulse sequences, control acquisition, connect to Red Pitaya hardware, and review reconstructed studies in Adelpha.
icon: lucide/scan-line
---

# Imaging Console

The operator workspace. It talks to Adelpha’s MRI FastAPI façade, not the old Qt UI and not the Red Pitaya socket from TypeScript. Sequences still run in Python (pypulseq, MaRCoS, `scan.json`).

In the desktop app that façade is already running. In the browser you start it yourself:

```bash
cd console
python -m services.api
```

Vite proxies `/api/mri` → `http://127.0.0.1:8002`.

| Data folder | When |
| --- | --- |
| **Settings → Imaging Console → Study data** | Desktop app (default: OS app data `mri4all/`) |
| `adelpha/.mri4all/` | Local API if `/opt/mri4all` is missing |

Restarting the API **clears the in-memory exam**. Register the patient again.

## Layout

| Area | Contents |
| --- | --- |
| **Viewers** | One, two, or three dark stages |
| **Sequence list** | Queue for the open exam. **+** at the bottom left inserts a sequence. **Play** starts the selected scan; **Stop** halts a running one. Right-click to rename, duplicate, or delete |
| **Parameter tabs** | SEQUENCE · ADJUSTMENTS · SYSTEM · PROCESSING · OTHER. Fields come from Python ``param_*`` / ``param()`` on the sequence class. A running, reconstructed, or completed scan is read-only; other queued sequences stay editable. |
| **Acquisition summary** | After a scan finishes, the right column lists timing, parameters, and results. Scroll if the list is long. |
| **Tool rail** | Scanner ping, Study Viewer, protocols, Flex Viewer, layout, and end exam |
| **Status line** | Exam and scanner reachability |

**Menu** (hamburger):

| Section | Items |
| --- | --- |
| **Exam** | Patient Registration, viewer count, Study Viewer, protocols, Flex Viewer, Close Exam |
| **Control** | System Status, Log Viewer, Configuration, Shutdown |
| **Help** | About |

Patient Registration can be closed with the header **X** or **Cancel**.

## Red Pitaya

**Configuration → General**

| Setting | Meaning |
| --- | --- |
| **Scanner IP** | Board address (MRI4ALL default is `10.42.0.251` on the scanner Ethernet) |
| **Hardware Simulation** | **False** to use real hardware; **True** to stay in software |

**Ping** (scanner button or System Status) opens **TCP port 11111** (MaRCoS), then tries ICMP if that port is closed. Success looks like `MaRCoS at <ip>:11111`. A timeout means this computer cannot see that address, often because you are on Wi‑Fi instead of the `10.42.0.x` link.

After you change the IP, ping uses it immediately. Restart the Python runtime before you **run sequences**, because MaRCoS still reads the IP when it is imported.

Acquisition and Reconstruction **Start / Stop** are Linux systemd services. On a Mac they stay **Unknown**. That is not a Red Pitaya failure.

## Operator windows

| Window | Behavior |
| --- | --- |
| **Patient Registration** | Starts an exam |
| **System Status** | Model, serial, software version, acq/recon, **Ping** (with the MaRCoS detail), device test, reset, disk |
| **Log Viewer** | Acquisition / Reconstruction / UI logs |
| **Configuration** | General, DICOM Export, Maintenance |
| **Study Viewer** | Exams, scans, DICOM send, export, clone, view-in |
| **Flex Viewer** | Extra result pane; can sit above Study Viewer |

Name, serial, and picture follow **Settings → 3D Model**.

## Theme

**Settings → Appearance** (or Imaging Console): **Adelpha** (violet) or **MRI4ALL** (navy and gold).

## What stays in Python

The TypeScript UI does not replace Experiment or MaRCoS. The façade queues work through `scan.json` and the `PREPARED` folder, same as MRI4ALL.
