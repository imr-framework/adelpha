---
icon: lucide/layout-grid
---

# Workspaces

Adelpha is three rooms in one window. Switch without quitting.

## Top bar

```text
Adelpha  ·  health  ·  scanner / mode  ·  workspace  ·  Settings  ·  Menu
```

| Control | Role |
| --- | --- |
| **Health** | Twin, Console, and Agents at a glance |
| **System Context** | `scanner_id / mode`, plus twin version in the dropdown |
| **Workspace** | **Digital Twin**, **Imaging Console**, or **Engineering Studio** |
| **Settings** | Models, twin runtime, Agents key, updates. [Settings](settings.md). |
| **Menu** | Changes with the workspace (especially Imaging Console) |

## How to switch

| Method | Action |
| --- | --- |
| Workspace pill | Click the current name → pick another |
| Keyboard | **⌘K** / **Ctrl+K** (ignored while you type in a field) |
| Escape | Closes open menus |

The last workspace is remembered. **Settings → Workspace** decides launch:

| Setting | Effect |
| --- | --- |
| **Restore layout on launch** on | Reopen the last workspace and side-panel state |
| **Restore layout on launch** off | Open **Startup workspace** |
| **Remember side panel width** | Keep the telemetry column width (Digital Twin) |

## Digital Twin

The default room:

| Area | Contents |
| --- | --- |
| **3D viewport** | Tool rail: magnet, EMI, RF, camera, gradient |
| **Side panel** | Telemetry, Agents, forecast, notes, sensors, CAD view |
| **Live dashboard** | Temperature and noise charts |
| **Bottom console** | Logging and a real shell (desktop only) |

See [Dashboard](dashboard.md).

## Imaging Console

Full-width operator layout: register a patient, build a queue, open studies, ping the scanner. Theme can be Adelpha violet or classic MRI4ALL navy and gold.

See [Imaging Console](imaging-console.md).

## Engineering Studio

A placeholder with a path back to Digital Twin. Reserved for coil and gradient work later.
