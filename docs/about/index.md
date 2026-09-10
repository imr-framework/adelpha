---
title: About Adelpha MRI and its maintainers
description: Who builds Adelpha MRI, how the Accessible Magnetic Resonance Laboratory maintains it, and where the console, twin, and desktop shell come from.
icon: lucide/users
---

# About Adelpha MRI

**Adelpha MRI** is an open-source desktop platform for **low-field MRI**: a digital twin of the scanner, an imaging console for exams and sequences, and an engineering viewport for CAD assemblies. The product name is **Adelpha MRI** so searchers can tell it apart from the butterfly genus *Adelpha*.

The public site is [imr-framework.github.io/adelpha](https://imr-framework.github.io/adelpha/). Source lives at [github.com/imr-framework/adelpha](https://github.com/imr-framework/adelpha).

<figure class="adelpha-preview">
  <img src="../assets/adelpha-preview.png" alt="Adelpha MRI Digital Twin workspace with 3D scanner, telemetry, and terminal." width="1440" />
  <figcaption>Digital Twin workspace in a packaged Adelpha MRI session.</figcaption>
</figure>

## What ships in one window

| Workspace | Role |
| --- | --- |
| [Digital Twin](../guide/dashboard.md) | 3D magnet, thermal / \(B_0\) / EMI / RF telemetry, Agents, terminal |
| [Imaging Console](../guide/imaging-console.md) | Exam registration, sequence queue, Red Pitaya ping, study review |
| [Engineering Studio](../guide/workspaces.md) | CAD parts tagged for simulation, in the same void as the twin |

The GUI is an observer and operator client. Closed-loop hardware I/O stays in Python (FLOCRA / MaRCoS). See [Architecture](../guide/architecture.md).

## Maintainers

Adelpha MRI is maintained by **Adelpha contributors** with the **Accessible Magnetic Resonance Laboratory (AMRL)**. Desktop metadata still names the Geethanath lab on some Electron leftover fields; the published GitHub organization is **[imr-framework](https://github.com/imr-framework)**.

| Surface | Value |
| --- | --- |
| Publisher (docs / schema.org) | Accessible Magnetic Resonance Laboratory (AMRL) |
| Repository | [imr-framework/adelpha](https://github.com/imr-framework/adelpha) |
| Desktop identifier | `org.adelpha.digital-twin-ui` |
| Contact in packaged Electron metadata | Adelpha / Geethanath lab |

Issues and pull requests go to the GitHub repository. Workshop notebooks for the DELTA DIY MRI course live on the `workshop/delta-2026` branch, not `main`. Mentees: [Learn](../learn/index.md) and [Repo setup](../learn/repo-setup.md).

## Lineage

Adelpha MRI is not a single greenfield codebase. Three trees share the installer:

| Tree | License | Origin |
| --- | --- | --- |
| Desktop shell (`src/`, `src-tauri/`) | MIT | Adelpha React/Tauri UI |
| Digital twin (`dtam/`) | MIT | DTAM twin, Twin HTTP API, optional Google ADK agents |
| Imaging console (`console/`) | GPL-3 | MRI4ALL Zeugmatron Z1 console (hackathon 2023), adapted behind a FastAPI façade |

A public installer that bundles the console is a **GPL-3 distribution of that runtime**. DTAM alone remains MIT. Details: [Citation and licensing](citation.md) and [Packaging limitations](../packaging/limitations.md).

## GitHub presence

Use these repository topics on [imr-framework/adelpha](https://github.com/imr-framework/adelpha) (Settings → Topics): `low-field-mri`, `magnetic-resonance-imaging`, `mri-console`, `mri-digital-twin`, `marcos`, `red-pitaya`, `medical-imaging`. Pin the repository on the **imr-framework** organization profile so the GitHub entity matches the docs site. Citation file: [`CITATION.cff`](https://github.com/imr-framework/adelpha/blob/main/CITATION.cff) at the repo root.
