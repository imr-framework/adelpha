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

**Adelpha** is the Intelligent Magnetic Resonance Framework: a dark-mode Tauri/React observer for [DTAM](https://github.com/imr-framework/dtam) and an **Imaging Console** that talks to the bundled MRI4ALL FastAPI façade (not the Qt UI).

Production installs ship one installer and a self-contained **Python supervisor sidecar**. Users do not install Python, Node.js, Rust, or pip packages.

> [!NOTE]
> Packaging, exclusions, signing, and the Electron comparison live in [`docs/packaging/index.md`](docs/packaging/index.md). DTAM is MIT; the imaging console in the sidecar is GPL-3.

Version **0.1.0**.

## Install (developers)

**Requirements:**
- [Node.js 18+](https://nodejs.org/)
- [Rust](https://rustup.rs/) (stable)
- Python 3.10–3.12 (to run or freeze the supervisor)
- [uv](https://docs.astral.sh/uv/) (optional docs group)

DTAM is included in this repo at `dtam/`.

```bash
make install
make tauri-dev          # Vite + Tauri; supervisor via python3 -m adelpha_runtime
```

The in-app terminal and window chrome require Tauri. `npm run dev` still opens the UI in a browser with `/api/*` proxies to ports 8080 / 8001 / 8002 if you start those APIs yourself.

### Packaged sidecar + installer (current OS)

```bash
make sidecar            # PyInstaller onedir → src-tauri/resources/python-runtime
make dist-current       # Tauri DMG / NSIS / deb+AppImage for this machine
make test-runtime
```

Windows and Linux installers are built on native CI runners. This macOS checkout can only smoke-test macOS.

Legacy Electron commands (`npm run electron:dev`, `dist:mac`, …) remain until Tauri parity is signed off. They are not the production shell.

## User data

Installed Adelpha writes to the OS application data / config / log directories, never into the `.app` bundle. Imaging data defaults to `<app-data>/mri4all`. Logs: `<app-log>/supervisor.log`. Optional Agents key: `<app-config>/google_api_key` (never commit this file).

## Documentation

| Topic | Link |
| --- | --- |
| Getting started | [`docs/start/index.md`](docs/start/index.md) |
| Desktop packaging (Tauri) | [`docs/packaging/index.md`](docs/packaging/index.md) |
| Workspaces | [`docs/guide/workspaces.md`](docs/guide/workspaces.md) |
| Imaging Console | [`docs/guide/imaging-console.md`](docs/guide/imaging-console.md) |
| Configuration & proxies | [`docs/guide/configuration.md`](docs/guide/configuration.md) |

```bash
uv sync --group docs && make docs-serve
```

Published docs: [imr-framework.github.io/adelpha](https://imr-framework.github.io/adelpha/)

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Recovery screen / Twin service failed | Check `<app-log>/supervisor.log`; DTAM sources and configs must be in the sidecar |
| Agents tab offline | Put `GOOGLE_API_KEY` in `dtam/.env` (dev) or the app config file `google_api_key`, then restart |
| Imaging Console empty | Console API is required at launch; see supervisor health in diagnostics export |
| Exam vanished after restart | Expected — in-memory session; register again |
| UI change not visible in `tauri dev` | Vite HMR should reload; restart Tauri if Rust/sidecar code changed |
| Terminal has no shell | Desktop (Tauri) only — not the browser `npm run dev` window |
