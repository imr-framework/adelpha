<div align="center">

# Adelpha

<strong>Adelpha observer GUI for the DTAM digital twin</strong>

[![React][react-badge]][react-url]
[![TypeScript][typescript-badge]][typescript-url]
[![Vite][vite-badge]][vite-url]
[![Electron][electron-badge]][electron-url]
[![Python][python-badge]][python-url]
[![Google ADK][adk-badge]][adk-url]
[![MCP][mcp-badge]][mcp-url]
[![Agent Skills][skills-badge]][skills-url]
[![A2A][a2a-badge]][a2a-url]
[![Docker][docker-badge]][docker-url]
[![UV][uv-badge]][uv-url]
[![Three.js][three-badge]][three-url]

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

[react-badge]: https://img.shields.io/badge/REACT-61DAFB?style=for-the-badge&logo=react&logoColor=black
[react-url]: https://react.dev/
[typescript-badge]: https://img.shields.io/badge/TYPESCRIPT-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
[vite-badge]: https://img.shields.io/badge/VITE-646CFF?style=for-the-badge&logo=vite&logoColor=white
[vite-url]: https://vite.dev/
[electron-badge]: https://img.shields.io/badge/ELECTRON-47848F?style=for-the-badge&logo=electron&logoColor=white
[electron-url]: https://www.electronjs.org/
[python-badge]: https://img.shields.io/badge/PYTHON-3776AB?style=for-the-badge&logo=python&logoColor=white
[python-url]: https://www.python.org/
[adk-badge]: https://img.shields.io/badge/GOOGLE%20ADK-4285F4?style=for-the-badge&logo=google&logoColor=white
[adk-url]: https://google.github.io/adk-docs/
[mcp-badge]: https://img.shields.io/badge/MCP-MODEL%20CONTEXT%20PROTOCOL-000000?style=for-the-badge&labelColor=555555
[mcp-url]: https://modelcontextprotocol.io/
[skills-badge]: https://img.shields.io/badge/SKILLS-AGENT%20SKILLS-2E7D32?style=for-the-badge&labelColor=555555
[skills-url]: https://agentskills.io/
[a2a-badge]: https://img.shields.io/badge/A2A-AGENT%20TO%20AGENT-E65100?style=for-the-badge&labelColor=555555
[a2a-url]: https://google.github.io/A2A/
[docker-badge]: https://img.shields.io/badge/DOCKER-2496ED?style=for-the-badge&logo=docker&logoColor=white
[docker-url]: https://www.docker.com/
[uv-badge]: https://img.shields.io/badge/UV-DE5FE9?style=for-the-badge&logo=python&logoColor=white
[uv-url]: https://docs.astral.sh/uv/
[three-badge]: https://img.shields.io/badge/THREE.JS-000000?style=for-the-badge&logo=threedotjs&logoColor=white
[three-url]: https://threejs.org/