---
icon: lucide/rocket
---

# Getting started

Adelpha is a desktop app. Most people only need the installer. Developers use the same UI with `make tauri-dev`.

## If you have the app

1. [Download](download.md) the `.dmg` or `.deb` for this computer, then install it.
2. Open it. On an unsigned Mac build, use **Right-click → Open** the first time.
3. Wait for the intro and the Python runtime. The top bar should read **All systems operational**.
4. Open **Settings** and set these:

    | Page | What to set |
    | --- | --- |
    | **3D Model** | Bundled scanner, or import GLB / STEP. [Settings](../guide/settings.md). |
    | **AI & Agents** | Google AI key if you want Agents. |
    | **Digital Twin** | Simulated or 48 mT Halbach. Restart after a change. |

5. Switch workspace with the top-bar pill, or **⌘K** / **Ctrl+K**.

Config, MRI data, and `supervisor.log` live outside the app. An optional Agents key is `google_api_key` in the app config folder.

!!! warning "Black window after a bad CAD import"
    Quit Adelpha, then remove this app’s WebKit data and reopen:

    ```bash
    rm -rf ~/Library/WebKit/org.adelpha.digital-twin-ui
    ```

    Current builds also offer **Clear imported models**. This does not delete DTAM or console config.

## If you are developing

### Requirements

| Tool | Purpose |
| --- | --- |
| Node.js 18+ | Vite UI and Tauri CLI |
| Rust (stable) | Desktop shell |
| Python 3.10–3.12 | Supervisor and sidecar freeze |
| [uv](https://docs.astral.sh/uv/) | Optional docs |

DTAM is already in this repository at `dtam/`.

```bash
make install
make tauri-dev
```

That starts Vite, the Tauri window, and `python -m adelpha_runtime`. You do not need three extra terminals for Twin, Agents, and MRI unless you are working in the **browser only**.

### Browser-only (`npm run dev`)

Vite on port **5173** proxies `/api/*` to the classic ports. Start the APIs yourself:

| Service | Command | URL | Needed for |
| --- | --- | --- | --- |
| Twin API | from `dtam/`: `make twin-api` | `http://127.0.0.1:8080` | Digital Twin telemetry |
| Agents API | from `dtam/`: `make agents-api` | `http://127.0.0.1:8001` | Agents chat |
| MRI API | from `console/`: `python -m services.api` | `http://127.0.0.1:8002` | Imaging Console |

```bash
cd dtam && make twin-api
cd dtam && make agents-api    # needs GOOGLE_API_KEY in dtam/.env or the shell
cd console && python -m services.api
```

The in-app terminal has **no real shell** in the browser. Use `make tauri-dev` for that.

Health checks:

```bash
curl -s http://127.0.0.1:8080/health
curl -s http://127.0.0.1:8002/health
```

!!! note "API key"
    Prefer `GOOGLE_API_KEY` in `dtam/.env` or **Settings → AI & Agents** in the desktop app. Nested agent `.env` files are easy to miss.

### What “good” looks like

| Check | Expect |
| --- | --- |
| Top-bar health | Green · All systems operational |
| System Context | `scanner_id / mode` from the twin |
| Telemetry | Thermal / \(B_0\) / EMI / RF updating about every 1.5 s |
| Agents | Online after a key is saved (desktop) or `make agents-api` (browser) |
| Imaging Console | Registration and queue after the MRI API is up |

## Docs site

```bash
uv sync --group docs
make docs-serve
```

See [Docs site](../project/docs-site.md).

## Installers

```bash
make sidecar
make dist-current
```

That builds a current-OS installer (DMG / NSIS / deb or AppImage). Recipients of a **packaged** Adelpha do not start Twin or MRI APIs themselves.

Unsigned Mac builds: **Right-click → Open**, or see [Signing](../packaging/signing.md).

## Troubleshooting

| Symptom | What to try |
| --- | --- |
| Recovery screen | Export diagnostics; read `<app-log>/supervisor.log` |
| Agents offline | Save a Google API key in Settings, or start `make agents-api` in browser mode |
| Imaging Console empty | Console service must be healthy; in Vite mode start `python -m services.api` |
| Exam disappeared | Expected after an API restart. Register again. |
| Camera blocked (Mac) | System Settings → Camera, or `tccutil reset Camera org.adelpha.digital-twin-ui` |
| CAD import missing in an old DMG | Rebuild the installer; older packages blocked WASM and `blob:` URLs |
| Terminal has no shell | Use the desktop app, not `npm run dev` |
| Gatekeeper warning | Unsigned local build. See [signing](../packaging/signing.md). |
