---
icon: lucide/layout-grid
---

# Workspaces

Adelpha is organized into **three principal operating environments**. Switch between them from the top bar without leaving the app.

## Top bar layout

Right-side header sequence:

```text
System Context · Workspace switcher · Settings · Menu
```

| Control | Role |
| --- | --- |
| **System Context** | Consolidated `scanner_id / mode` pill; dropdown shows scanner, mode, and `twin_version` (configuration) |
| **Workspace switcher** | Compact labeled pill — e.g. **Digital Twin ▾** — with icon + name |
| **Settings** | Application settings. Console theme, 3D model, and Workspace prefs persist. |
| **Menu** | Context menu — workspace-specific destinations |

Dropdown menus use a subtle default card border at rest. While open, an Adelpha purple→blue gradient border **fades in, holds, and fades out** on a loop.

## Switching workspaces

| Method | Action |
| --- | --- |
| Workspace pill | Click **Digital Twin ▾** (or current name) → pick a workspace |
| Keyboard | **⌘K** / **Ctrl+K** toggles the workspace menu (skipped when typing in inputs) |
| Escape | Closes open dropdowns |

Last workspace is stored in `localStorage` as `adelpha_workspace_id`. **Settings → Workspace** controls what happens on launch:

| Setting | Effect |
| --- | --- |
| **Restore layout on launch** (on) | Reopen the last workspace and side-panel collapse state |
| **Restore layout on launch** (off) | Open **Startup workspace** instead |
| **Remember side panel width** | Keep telemetry panel width across sessions (Digital Twin) |

### Available workspaces

| Workspace | Icon | Status |
| --- | --- | --- |
| **Digital Twin** | Box | Live — magnet viewport, telemetry, Agents, console |
| **Imaging Console** | ScanLine | Live — MRI4ALL-style operator console over the `:8002` API |
| **Engineering Studio** | Wrench | Placeholder — shell ready for future engineering tools |

## Digital Twin workspace

Default environment. Includes:

- **3D viewport** — CAD magnet mesh, draggable tool rail (magnet / EMI / RF / camera / gradient)
- **Side panel** — Telemetry · Agents · forecast · notes · raw sensors · CAD view
- **Live dashboard overlay** — temperature / noise history charts
- **Bottom console** — Logging + Terminal

See [Dashboard](dashboard.md) for panel and viewport details.

## Imaging Console workspace

MRI operator layout. Replaces the twin viewport and side panel with a full-width shell backed by the MRI console API.

Details — windows, theme, scanner model, and API — are in [Imaging Console](imaging-console.md).

Summary:

- Register a patient, build a sequence queue, prepare / run / stop scans
- Study Viewer (exams, scans, DICOM send, clone, view-in)
- System Status, Log Viewer, Configuration, Flex Viewer
- Console theme: Adelpha violet or legacy MRI4ALL navy/gold

## Engineering Studio workspace

Placeholder card with a link back to **Digital Twin**. Reserved for coil design, gradient tuning, and other engineering workflows.

## Module map

| File | Role |
| --- | --- |
| `src/twin/TopbarControls.tsx` | System Context + workspace switcher + app menu |
| `src/twin/workspacePrefs.ts` | Startup workspace, restore layout, remember panel width |
| `src/twin/ImagingConsole.tsx` | Imaging Console layout and sequence editor |
| `src/App.tsx` | Workspace routing; hides twin viewport/panel in alt workspaces |
