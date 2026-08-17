---
icon: lucide/layout-dashboard
---

# Dashboard

## Header

Shows **Adelpha** branding plus application-level controls on the right:

| Control | Description |
| --- | --- |
| **System Context** | Pill showing `scanner_id / mode`. Dropdown lists scanner, mode, and `twin_version` (configuration). |
| **Workspace switcher** | Labeled pill (e.g. **Digital Twin ▾**) with workspace icon. **⌘K** / **Ctrl+K** opens the menu. |
| **Settings** | Settings shell button |
| **Menu** | Hamburger — in **Imaging Console** shows Exam · Control · Help · Debug |

Connection health is reflected in the console live indicator and telemetry freshness, not as a separate clock pill.

See [Workspaces](workspaces.md) for switching between Digital Twin, Imaging Console, and Engineering Studio.

## Side panels (Digital Twin)

1. **Telemetry** — Thermal, Magnetic / \(B_0\), EMI, RF summaries.
2. **Agents** — Chat against DTAM ADK (`make agents-api` on `:8001`). Offline until that API is up.
3. **Forecast** — Horizon (s), optional magnet setpoint (°C), heating rate, PINN toggle → **Run forecast**.
4. **Notes** — `notes[]` from the twin (ops / debug).
5. **Raw sensors** — on-demand `GET /sensors/batch`.
6. **View / CAD** — exploded slider, wireframe, temperature map (when an STL is configured).

Panel width, collapse state, and Telemetry vs Agents tab persist in `localStorage`.

## Provenance

Every `TimestampedQuantity` carries `source`. Badges:

| Source | Meaning |
| --- | --- |
| `measured` | Sensor channel |
| `estimated` | Derived twin estimate |
| `predicted` | Forecast horizon only |
| `nominal` | Design / profile constant |

Confidence is shown when present. Units stay visible (never strip °C, T, MHz, …).

## 3D viewport & tool rail

The magnet scene loads an optional CAD mesh (`VITE_MAGNET_CAD_URL`). A **draggable tool rail** selects the active viewport mode:

| Tool | Purpose |
| --- | --- |
| Magnet | Default CAD / thermal view |
| EMI | EMI visualization mode |
| RF | RF noise context |
| Camera | Webcam feed + head-pose tracking |
| Gradient | Gradient coil emphasis |

Rail position persists (`twin_view_tool_rail_pos_v2`).

### Camera & head motion

When **Camera** is active, MediaPipe Face Landmarker tracks head pose from the webcam:

- Nose tracker overlay on the video feed
- **Motion** menu: set reference pose, download JSON/CSV log, **Share with agent**
- Motion context is appended to Agents chat sends; Share opens Agents and posts a summary

Mask style and background mode persist in `localStorage`.

## Overlay charts

“Open live dashboard” overlays history charts for magnet temperature and RF noise floor, plus illustrative spectra. EMI peak frequency biases the MRI spectrum highlight; these plots are operator aids, not calibrated spectrum analyzers.

## Agents tab

Beyond plain text chat:

| Feature | Detail |
| --- | --- |
| **Markdown** | Assistant replies render with `react-markdown` |
| **Model picker** | Gemini models via `VITE_ADK_MODELS`; selection persisted |
| **Attachments** | Image upload inline in the composer |
| **Forecast plots** | Tool results with `plot_png_base64` or artifact refs render inline |
| **Head motion share** | Camera motion log can be sent to the agent in one click |

Streaming uses SSE with deduplication on repeated chunks.

## Console

Bottom console tabs:

- **Logging** — read-only system events (timestamped, level-colored)
- **Terminal** — xterm.js REPL

### Browser terminal (built-ins)

`help` · `clear` · `status` · `sensors` · `hide` · `forecast-hint`

### Electron terminal (real shell)

Run `npm run electron:dev` or the packaged Mac app. Terminal attaches to `$SHELL` via `node-pty` + preload IPC — full bash/zsh session on loopback.

Console open state and active tab persist in `localStorage`.

## Launch intro

On first load per browser **session**, a cinematic Adelpha intro plays (~7 s). Subsequent navigations skip it. Force replay with `?replayIntro=1`. Respects `prefers-reduced-motion`.

## Out of scope

- Shim / gradient / safety override **commands** (no such Twin API actuators)
- Treating predicted values as live measurements
- Embedding Python / Gemini SDKs in the browser (use DTAM `make agents-api` instead)
- Live scan execution from Imaging Console (UI shell only today)
