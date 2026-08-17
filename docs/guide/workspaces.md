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
| **Settings** | Application settings (shell) |
| **Menu** | Context menu — workspace-specific destinations |

Dropdown menus use a subtle default card border at rest. While open, an Adelpha purple→blue gradient border **fades in, holds, and fades out** on a loop.

## Switching workspaces

| Method | Action |
| --- | --- |
| Workspace pill | Click **Digital Twin ▾** (or current name) → pick a workspace |
| Keyboard | **⌘K** / **Ctrl+K** toggles the workspace menu (skipped when typing in inputs) |
| Escape | Closes open dropdowns |

The selected workspace persists in `localStorage` under `adelpha_workspace_id` and restores on reload.

### Available workspaces

| Workspace | Icon | Status |
| --- | --- | --- |
| **Digital Twin** | Box | Live — magnet viewport, telemetry, Agents, console |
| **Imaging Console** | ScanLine | UI shell — scan protocol editor + viewers (see below) |
| **Engineering Studio** | Wrench | Placeholder — shell ready for future engineering tools |

## Digital Twin workspace

Default environment. Includes:

- **3D viewport** — CAD magnet mesh, draggable tool rail (magnet / EMI / RF / camera / gradient)
- **Side panel** — Telemetry · Agents · forecast · notes · raw sensors · CAD view
- **Live dashboard overlay** — temperature / noise history charts
- **Bottom console** — Logging + Terminal

See [Dashboard](dashboard.md) for panel and viewport details.

## Imaging Console workspace

MRI operator-style layout inspired by clinical console UIs. Replaces the twin viewport and side panel with a dedicated full-width shell.

### Viewer tier (three screens)

Three equal dark panels across the top row:

| Panel | Idle | During scan experiment |
| --- | --- | --- |
| Image | Empty black stage | Title **Image** + acquired slice data |
| ADC Signal | Empty black stage | Title **ADC Signal** + signal plot |
| Sequence Timing | Empty black stage | Title **Sequence Timing** + timing lanes |

By default all viewers are **dark-mode idle** — no placeholder graphics or demo plots. Content appears only when a scan experiment is running (`experimentActive` in the client).

### Control tier

| Area | Contents |
| --- | --- |
| **Sequence list** (left) | Numbered protocols (RF Spin-Echo, 3D Turbo Spin-Echo, …); wrench on active item; checkmarks on completed |
| **Parameter panel** (center) | Patient/protocol meta, tabs **SEQUENCE · ADJUSTMENTS · SYSTEM · PROCESSING · OTHER**, TE/TR/FOV/resolution fields |
| **Tool rail** (right) | Scanner · viewport · protocols · layout · exit icons |
| **Status bar** | e.g. `Scanner ready` |

Exam / Control / Help / Debug menus live in the top-bar **Menu** (hamburger) while this workspace is active — not in a separate menubar inside the console.

!!! note "Backend integration"
    The Imaging Console UI shell is client-side today. Wiring to live scan execution goes through DTAM / scanner adapters in future work.

## Engineering Studio workspace

Placeholder card with a link back to **Digital Twin**. Reserved for coil design, gradient tuning, and other engineering workflows.

## Module map

| File | Role |
| --- | --- |
| `src/twin/TopbarControls.tsx` | System Context + workspace switcher + app menu |
| `src/twin/ImagingConsole.tsx` | Imaging Console layout and sequence editor |
| `src/App.tsx` | Workspace routing; hides twin viewport/panel in alt workspaces |
