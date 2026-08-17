<div align="center">

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

</div>

> [!NOTE]
> Adelpha is a browser GUI — it does **not** run Python or Gemini. Live data comes from **[DTAM](https://github.com/LeoMcBills/dtam)** on your machine (`make twin-api` on port **8080**). Without that backend the app opens but stays disconnected.

## Install

**Requirements:** [Node.js 18+](https://nodejs.org/) · a **DTAM** clone next to this repo · [uv](https://docs.astral.sh/uv/) (for DTAM Python deps)

```text
~/dtam              ← backend
~/digital_twin_ui   ← this repo
```

### 1. Start the twin backend

In a terminal, from your **DTAM** clone (keep it running):

```bash
cd ../dtam
uv sync              # first time only
make twin-api
```

### 2. Start the GUI

In a **second** terminal:

```bash
cd ../digital_twin_ui
npm install          # first time only
npm run dev
```

Open **http://localhost:5173/** (or the URL Vite prints). Within a few seconds you should see live **Thermal**, **B₀**, **EMI**, and **RF** values updating.

### Optional: Agents chat

For the **Agents** side-panel tab, start a third process in DTAM (requires `GOOGLE_API_KEY` in the DTAM repo `.env`):

```bash
cd ../dtam && make agents-api
```

Telemetry works without this; only chat stays offline.

## Verify

```bash
curl -s http://127.0.0.1:8080/health
```

Expect `"status":"ok"` and `"connected":true`. In the GUI, the console **Logging** tab should show a green live indicator.

## Documentation

Detailed setup, workspaces, desktop app, env vars, and troubleshooting:

| Topic | Link |
| --- | --- |
| Full getting started | [`docs/start/index.md`](docs/start/index.md) |
| Workspaces (Digital Twin · Imaging Console) | [`docs/guide/workspaces.md`](docs/guide/workspaces.md) |
| Configuration & proxies | [`docs/guide/configuration.md`](docs/guide/configuration.md) |
| macOS desktop package | [`docs/start/index.md#macos-desktop-package`](docs/start/index.md) |

Preview the docs site locally:

```bash
uv sync --group docs && make docs-serve
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Disconnected / no live data | Start `make twin-api` in DTAM and leave that terminal open |
| Agents tab offline | Run `make agents-api` in DTAM; set `GOOGLE_API_KEY` in DTAM `.env` |
| Port already in use | Use the alternate URL Vite prints in the terminal |

More help → [`docs/start/index.md`](docs/start/index.md#troubleshooting)
