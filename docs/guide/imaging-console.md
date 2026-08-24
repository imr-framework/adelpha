---
icon: lucide/scan-line
---

# Imaging Console

The **Imaging Console** workspace is Adelpha’s operator shell. It talks to a FastAPI façade on **port 8002** (`python -m services.api` from `console/`). The browser and Electron renderer never open the Red Pitaya TCP socket; acquisition still runs in Python (FLOCRA, pypulseq, MaRCoS, `scan.json` queue).

Vite and Electron proxy `/api/mri` → `http://127.0.0.1:8002`.

## Start the API

```bash
cd console
python -m services.api
# → http://127.0.0.1:8002
```

Install Python deps from `console/requirements.txt` (or `console/services/api/requirements.txt` for a slimmer façade-only env).

| Path | Role |
| --- | --- |
| `/opt/mri4all` | Used when it exists and is writable |
| `adelpha/.mri4all/` | Local fallback for logs, config, and scan data |

Restarting the API **clears the in-memory exam**. Register the patient again.

Health:

```bash
curl -s http://127.0.0.1:8002/health
```

## Layout

| Area | Contents |
| --- | --- |
| **Viewers** | One, two, or three dark stages. Loaded results have no on-screen “Viewer 1/2/3” titles. |
| **Sequence list** | Queue for the active exam. Right-click: Rename, Duplicate, Delete (in-app overlays — Electron has no `prompt`/`confirm`). |
| **Parameter tabs** | SEQUENCE · ADJUSTMENTS · SYSTEM · PROCESSING · OTHER |
| **Tool rail** | Scanner, layout, Flex maximize, and related actions |
| **Status bar** | Exam / scanner line |

The top-bar **Menu** (hamburger) is workspace-specific:

| Section | Items |
| --- | --- |
| **Exam** | Patient Registration, 1/2/3 viewers, Study Viewer, Protocol Browser, Flex Viewer, Close Exam |
| **Control** | System Status, Log Viewer, Configuration, Shutdown |
| **Help** | About |
| **Debug** | Refresh scan list |

## Operator windows

These dialogs follow MRI4ALL behavior (navy/gold or Adelpha violet, depending on **Console theme**). Typography matches Adelpha (12px Inter body, 18px titles).

| Window | Behavior |
| --- | --- |
| **Patient Registration** | Starts an exam (`POST /exam/start`). |
| **System Status** | Model name, serial, Adelpha software version **0.1.0**, scanner render, acq/recon Start–Stop–Kill, ping/test/reset, disk. Name, serial, and picture follow **Settings → 3D Model**. |
| **Log Viewer** | Acquisition / Reconstruction / UI (and API) logs with ERR/WRN/DBG coloring. |
| **Configuration** | General, DICOM Export, Maintenance. Save then Cancel. Add/delete DICOM targets. |
| **Study Viewer** | EXAMS table (Patient widest, Date/Time, ACC), SCANS checkboxes, DICOM Send, RESULTS, Export / Definition / Clone / View in. View in does **not** close Study Viewer. |
| **Flex Viewer** | Independent overlay (can sit on Study Viewer). Maximize/Restore. Empty black pane or a loaded result. |

## Console theme and scanner model

Under **Settings** (gear):

| Setting | Where | Effect |
| --- | --- | --- |
| **Console theme** | Appearance and Imaging Console | **Adelpha** (violet) or **MRI4ALL** (navy and gold). Persisted as `adelpha.consoleTheme`. |
| **3D Model** | 3D Model | Halbach vs MRI4ALL Zeugmatron Z1. Updates System Status copy and scanner image. Persisted as `adelpha.scannerModel`. Software version is always Adelpha **0.1.0**. |

Most other Settings controls are a local draft and do not drive the twin. Workspace prefs (startup workspace, restore layout, panel width) **do** persist — see [Configuration](configuration.md).

## What stays in Python

Do not expect the TypeScript UI to replace Experiment or MaRCoS. The façade queues work through `scan.json` and the `PREPARED` folder, same as MRI4ALL.

## Module map

| File | Role |
| --- | --- |
| `src/twin/ImagingConsole.tsx` | Shell, hamburger actions, queue |
| `src/twin/Mri4allWindows.tsx` | Status, Log, Config, Study, Flex |
| `src/twin/ImagingDialogs.tsx` | Registration, About, alerts |
| `src/twin/mri/api.ts` | `/api/mri` client |
| `src/twin/consoleTheme.ts` | Adelpha / MRI4ALL theme |
| `src/twin/scannerModel.ts` | Halbach / Z1 profiles |
| `console/services/api/app.py` | FastAPI façade |
