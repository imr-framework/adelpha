---
title: Adelpha MRI Digital Twin dashboard
description: Use the Adelpha MRI Digital Twin workspace for 3D scanner visualization, thermal and B0 telemetry, Agents, forecasting, and the system terminal.
icon: lucide/layout-dashboard
---

# Dashboard

This page is the Digital Twin workspace: the 3D view, side panel, Agents, and console.

## Header

| Control | Description |
| --- | --- |
| **Health** | Twin / Console / Agents |
| **System Context** | `scanner_id / mode` |
| **Workspace** | Switch rooms with **⌘K** / **Ctrl+K** |
| **Settings** | Models, runtime, key, devices, updates. [Settings](settings.md). |
| **Menu** | Workspace-specific |

## Side panel

| Tab | Contents |
| --- | --- |
| **Telemetry** | Thermal, magnetic / \(B_0\), EMI, RF |
| **Agents** | Chat with the twin (needs a Google API key) |
| **Forecast** | Horizon, setpoint, heating rate, PINN |
| **Notes** | Messages from the twin |
| **Raw sensors** | On-demand sensor batch |
| **View / CAD** | Explode, wireframe, temperature map |

Width, collapse, and Telemetry vs Agents persist when **Settings → Workspace** says so.

## Provenance

| Source | Meaning |
| --- | --- |
| `measured` | Sensor |
| `estimated` | Twin estimate |
| `predicted` | Forecast only |
| `nominal` | Design value |

Confidence is shown when the twin sends it. Units stay on the number.

## Viewport and tool rail

The scene uses the **active scanner model** from Settings (bundled or imported). The rail picks a mode:

| Tool | Purpose |
| --- | --- |
| Magnet | CAD / thermal |
| EMI | EMI context |
| RF | RF noise context |
| Camera | Webcam and head pose |
| Gradient | Gradient emphasis |

Rail position is remembered.

### Camera

Select **Camera** on the rail. Allow the camera when macOS or Windows asks.

The live picture should appear first. Face tracking loads next (bundled WASM in the app; models download once from Google). You can set a reference pose, export a JSON/CSV motion log, and **Share with agent**.

See [Settings](settings.md#camera) if permission is denied.

## Live dashboard

**Open live dashboard** overlays magnet temperature, Johnson noise, and the **EMI sensor spectrum**.

In **simulation**, Johnson noise is drawn from temperature (\(\sqrt{T}\)), and the EMI plot shows narrow interference spikes over a white-noise floor in arbitrary units on a logarithmic 1–100 kHz axis. That EMI display is illustrative, not a phantom signal or a calibrated analyzer.

In **hardware**, the dashboard and Telemetry panel wait until a recent measured sample arrives. **Configure sensors** and **Check connections** open **Settings → Devices**. The connection guide matches [Device link](devices.md). The header, floating navigation, and terminal stay in place.

A board may publish only some families. Connected channels render; the others keep their own copy:

| Card | Hardware copy |
| --- | --- |
| Magnet temperature | Plot when magnet temperature is received; otherwise “Temperature sensor not connected” |
| Johnson noise | “Johnson noise is simulated only; it is not measured in hardware” |
| EMI | RMS stamp when `voltage_rms` is received, with no spectrum; otherwise “EMI sensor not connected” |

Telemetry cards that have no usable values say **No usable … measurements**. Twin **Notes** list each family as received, not connected, reported missing, invalid, or stale. Missing or omitted sensors are never drawn as zero. Hardware does not synthesize an EMI spectrum from RMS. Reception uses a 30-second freshness window; API connectivity alone does not count as sensor data.

## Agents

| Feature | Detail |
| --- | --- |
| **Markdown** | Assistant replies |
| **Model** | Gemini models you configured in Settings |
| **Attachments** | Images in the composer |
| **Forecast plots** | Inline when a tool returns a plot |
| **Head motion** | One-click share from the camera HUD |

## Console

| Tab | Contents |
| --- | --- |
| **Logging** | Timestamped system events |
| **Terminal** | Real `$SHELL` on desktop. In the browser: `help`, `clear`, `status`. |

## Launch intro

Plays once per install (desktop) or once per browser tab. Replay with `?replayIntro=1`. Honors reduced motion.

## Out of scope

- Shim / gradient / safety **commands** on the Twin API
- Treating predicted values as live measurements
- Opening the Red Pitaya socket from the UI (use Imaging Console + Python)
