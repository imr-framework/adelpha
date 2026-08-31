<div align="center">

<img src="public/logos/adelpha-gradient-logo.svg" alt="Adelpha" width="180" />

# Adelpha

![React](https://img.shields.io/badge/React-18-61DAFB.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)
![Vite](https://img.shields.io/badge/Vite-5.x-646CFF.svg)
![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB.svg)
![Python](https://img.shields.io/badge/python-v3.10+-blue.svg)
![Google ADK](https://img.shields.io/badge/Google%20ADK-Latest-green.svg)
![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue.svg)
![Three.js](https://img.shields.io/badge/Three.js-R3F-black.svg)
![Development Status](https://img.shields.io/badge/status-Alpha-yellow.svg)

![adelpha UI](assets/README/adelpha.png)

</div>

**Adelpha** is an open-source, intelligent digital-twin platform for developing, monitoring, and operating low-field MRI systems. It integrates scanner visualization, real-time system data, imaging workflows, engineering tools, and AI-assisted capabilities within a unified environment. Its modular architecture can also be adapted to other MRI systems and research applications.

> [!NOTE]
> Packaging and signing: [`docs/packaging/index.md`](docs/packaging/index.md). DTAM is MIT; the imaging console in the sidecar is GPL-3.

## Clone

```bash
git clone https://github.com/imr-framework/adelpha.git
```

Clone a specific branch with `-b`.

```bash
git clone -b [branch_name] https://github.com/imr-framework/adelpha.git
```
Example:

```bash
git clone -b workshop/delta-2026 https://github.com/imr-framework/adelpha.git
```

To fetch only that branch:

```bash
git clone -b [branch_name] --single-branch https://github.com/imr-framework/adelpha.git
```

If you already have a clone, switch with `git checkout [branch_name]`.

## Install (developers)

**Requirements:** Node.js 18+, [Rust](https://rustup.rs/) (stable), Python 3.10–3.12, optional [uv](https://docs.astral.sh/uv/) for docs.

```bash
make install
make tauri-dev          # Vite + Tauri + Python supervisor
```

The terminal and native file dialogs need Tauri. `npm run dev` is browser-only; start Twin / Agents / MRI APIs yourself (see [Getting started](docs/start/index.md)).

### Packaged installer (this OS)

```bash
make sidecar
make dist-current
make test-runtime
```

## User data

Written next to other apps, never into the `.app`: MRI data under `<app-data>/mri4all`, logs in `<app-log>/supervisor.log`, optional Agents key in `<app-config>/google_api_key`. Imported CAD stays in this machine’s IndexedDB.

## Documentation

| Topic | Link |
| --- | --- |
| Getting started | [`docs/start/index.md`](docs/start/index.md) |
| Settings, CAD, camera, updates | [`docs/guide/settings.md`](docs/guide/settings.md) |
| Imaging Console / Red Pitaya | [`docs/guide/imaging-console.md`](docs/guide/imaging-console.md) |
| Desktop packaging | [`docs/packaging/index.md`](docs/packaging/index.md) |

```bash
uv sync --group docs && make docs-serve
```

Published: [imr-framework.github.io/adelpha](https://imr-framework.github.io/adelpha/)

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Recovery screen | `<app-log>/supervisor.log`; export diagnostics |
| Agents offline | Settings → AI & Agents (or `GOOGLE_API_KEY` in `dtam/.env` for browser mode) |
| Imaging Console empty | Console service must be up |
| Exam vanished after restart | Expected. Register again. |
| Camera denied (Mac) | System Settings → Camera, or `tccutil reset Camera org.adelpha.digital-twin-ui` |
| Black window after CAD import | Settings → Files → Clear all imports, or remove `~/Library/WebKit/org.adelpha.digital-twin-ui` |
| Terminal has no shell | Desktop app only. Not `npm run dev`. |
