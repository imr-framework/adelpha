---
title: MRI4ALL integration and attribution in Adelpha MRI
description: Adelpha MRI embeds the MRI4ALL Zeugmatron Z1 console as a GPL-3 Python runtime behind a FastAPI façade, with an optional MRI4ALL navy-and-gold theme.
icon: lucide/copyright
---

# MRI4ALL integration and attribution

The Imaging Console in Adelpha MRI is the **MRI4ALL Zeugmatron Z1** console software, developed during the [MRI4ALL Hackathon 2023](https://github.com/mri4all/console), running under Adelpha’s desktop shell instead of the original PyQt UI.

## What Adelpha kept

| MRI4ALL piece | Where it lives now |
| --- | --- |
| Sequence plugins (`SequenceBase`) | `console/sequences/` |
| Folder queue (`scan.json`, `PREPARED`) | `console/common/queue.py` and data dirs |
| Acquisition / reconstruction workers | `console/services/acq`, `console/services/recon` |
| MaRCoS extras / server | `console/external/marcos_*` |
| Operator windows (status, logs, studies) | React in `src/twin/Mri4allWindows.tsx`, same REST/WebSocket contract |

The TypeScript UI does **not** replace Experiment or MaRCoS. It queues work through `scan.json` and `PREPARED`, same as MRI4ALL.

## What Adelpha changed

MRI4ALL’s standalone `services.acq.main` and `services.recon.main` redirect stdout and assume **systemd**. Adelpha must not import those modules in the desktop sidecar. `console/services/api/pipeline.py` polls the **same folder queue** so **Prepare** in the Imaging Console actually runs `SequenceBase` on macOS and Windows.

```text
Imaging Console (React)
        ↓ REST + WebSocket
FastAPI façade  console/services/api/app.py
        ↓ scan.json / PREPARED
In-process acq/recon pipeline  (not systemd)
        ↓
SequenceBase / recon modes
```

Data folders:

| Location | When |
| --- | --- |
| OS app data `mri4all/` | Packaged Adelpha |
| `adelpha/.mri4all/` | Local API if `/opt/mri4all` is missing |

Restarting the API **clears the in-memory exam**. Register the patient again.

## Theme and scanner profile

**Settings → Appearance** (or Imaging Console): **Adelpha** (violet) or **MRI4ALL** (navy and gold). Implementation: `src/twin/consoleTheme.ts`.

**Settings → 3D Model**: **MRI4ALL Zeugmatron Z1** is a console-oriented profile with **no bundled CAD mesh**. Use it when you care about console chrome, not a 3D magnet.

## License and source

`console/` is **GNU GPL version 3**. Upstream project: [github.com/mri4all/console](https://github.com/mri4all/console). Adelpha’s tree includes that console plus the FastAPI façade. Distributing the desktop sidecar with the console inside is a GPL-3 distribution: corresponding source must ship. See [Citation and licensing](citation.md) and [Packaging limitations](../packaging/limitations.md).

MRI4ALL’s own overview video (architecture, custom sequences, reconstruction) is still the best intro to the console internals: [YouTube](https://www.youtube.com/watch?v=8GNmocJP-14).
