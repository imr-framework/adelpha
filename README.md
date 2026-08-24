<div align="center">

<img src="public/logos/adelpha-gradient-logo.svg" alt="Adelpha" width="180" />

# Adelpha

![React](https://img.shields.io/badge/React-18-61DAFB.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)
![Vite](https://img.shields.io/badge/Vite-5.x-646CFF.svg)
![Electron](https://img.shields.io/badge/Electron-Desktop-47848F.svg)
![Python](https://img.shields.io/badge/python-v3.10+-blue.svg)
![Google ADK](https://img.shields.io/badge/Google%20ADK-Latest-green.svg)
![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue.svg)
![Three.js](https://img.shields.io/badge/Three.js-R3F-black.svg)
![Development Status](https://img.shields.io/badge/status-Alpha-yellow.svg)

![adelpha UI](assets/README/adelpha.png)

</div>

**Adelpha** is the Intelligent Magnetic Resonance Framework: a dark-mode Electron/React observer for [DTAM](https://github.com/imr-framework/dtam) and an **Imaging Console** that talks to a local MRI4ALL FastAPI façade (not the Qt UI).

> [!NOTE]
> Live twin telemetry requires **[DTAM](https://github.com/imr-framework/dtam)** (`make twin-api` on port **8080**). The Imaging Console requires the MRI API on port **8002**. Without those backends the app still opens, but those surfaces stay disconnected.

Version **0.1.0**.

## Install

**Requirements:**
- [Node.js 18+](https://nodejs.org/)
- A **DTAM** clone next to this repo (for the Digital Twin)
- Python 3.10+ (for the Imaging Console API)
- [uv](https://docs.astral.sh/uv/) (DTAM Python deps and optional docs)

```text
~/dtam              ← twin + agents backends
~/adelpha           ← this repo
```

### 1. Twin backend (Digital Twin workspace)

From your **DTAM** clone:

```bash
cd dtam
uv sync --all-groups
make twin-api          # :8080 — required for telemetry
make agents-api        # :8001 — optional, Agents chat (needs GOOGLE_API_KEY)
```

### 2. MRI console API (Imaging Console workspace)

From this repo, in a Python environment that has `console/requirements.txt` installed:

```bash
cd adelpha/console
python -m services.api    # :8002
```

If `/opt/mri4all` is not writable, data lives under `adelpha/.mri4all/`. Restarting this API **clears the in-memory exam** — register the patient again.

TypeScript never opens the Red Pitaya socket. Sequence execution stays in the Python console (FLOCRA / pypulseq / MaRCoS).

### 3. Start the GUI

```bash
cd adelpha
npm install
npm run electron:dev    # production Vite build + Electron (typical)
# or
npm run dev             # Vite on :5173 (browser; HMR)
```

`electron:dev` does **not** hot-reload UI changes — rebuild/restart after CSS or TypeScript edits.

Packaged apps:

```bash
npm run dist:mac      # → release/
npm run dist:win
npm run dist:linux
```

## Verify

```bash
curl -s http://127.0.0.1:8080/health    # Twin API
curl -s http://127.0.0.1:8002/health    # MRI console API
```

In the GUI, the console **Logging** tab should show a green live indicator when DTAM is up. Switch the workspace to **Imaging Console** (⌘K) for registration, sequences, Study Viewer, Status, logs, and configuration.

## Documentation

| Topic | Link |
| --- | --- |
| Getting started | [`docs/start/index.md`](docs/start/index.md) |
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
| Disconnected / no live twin data | Start `make twin-api` in DTAM |
| Agents tab offline | `make agents-api` in DTAM; `GOOGLE_API_KEY` in DTAM `.env` |
| Imaging Console empty / API errors | Start `python -m services.api` from `console/` |
| Exam vanished after API restart | Expected — in-memory session; register again |
| UI change not visible in Electron | Restart `npm run electron:dev` |
| Terminal has no shell in Electron | `npx electron-rebuild -f -w node-pty` |
| Port already in use | Use the URL Vite prints |
