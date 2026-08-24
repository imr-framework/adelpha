---
icon: lucide/settings-2
---

# Configuration

## Environment

Optional Vite env (create `.env.local` if you need to override defaults). Defaults already match the recommended proxy setup.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_DTAM_API_URL` | `/api/dtam` | Twin API base (proxy path or absolute URL) |
| `VITE_ADK_API_URL` | `/api/agents` | Agents (ADK) API base |
| `VITE_MRI_API_URL` | `/api/mri` | MRI console API base |
| `VITE_ADK_APP_NAME` | `dtam` | ADK app from `GET /list-apps` |
| `VITE_ADK_USER_ID` | `gui-user` | Local demo user id for ADK sessions |
| `VITE_ADK_MODELS` | built-in list | Optional `id:Label,...` model picker |
| `VITE_ADK_MODEL` | first model | Default selected model id |
| `VITE_MAGNET_CAD_URL` | unset | Public URL for magnet mesh (e.g. `/MRI_base.stl`) |
| `VITE_MAGNET_CAD_SCALE` | inferred | Uniform scale after centering |
| `VITE_MAGNET_CAD_RX_DEG` / `RY` / `RZ` | `0` | Orientation offsets |

Electron can also override backend hosts:

| Variable | Default |
| --- | --- |
| `DTAM_TWIN_URL` | `http://127.0.0.1:8080` |
| `DTAM_AGENTS_URL` | `http://127.0.0.1:8001` |
| `MRI4ALL_API_URL` | `http://127.0.0.1:8002` |
| `MRI4ALL_API_PORT` | `8002` (Python process) |
| `MRI4ALL_BASE` | `/opt/mri4all` or `adelpha/.mri4all/` |

### Twin API base URL

=== "Proxy (recommended)"

    ``` env
    VITE_DTAM_API_URL=/api/dtam
    ```

    `vite.config.ts` rewrites `/api/dtam/:path*` → `http://127.0.0.1:8080/:path*`.

=== "Direct"

    ``` env
    VITE_DTAM_API_URL=http://127.0.0.1:8080
    ```

    Requires the Vite origin in DTAM `DTAM_CORS_ORIGINS`.

### Agents API base URL

=== "Proxy (recommended)"

    ``` env
    VITE_ADK_API_URL=/api/agents
    ```

    Rewrites `/api/agents/:path*` → `http://127.0.0.1:8001/:path*`.

=== "Direct"

    ``` env
    VITE_ADK_API_URL=http://127.0.0.1:8001
    ```

### MRI console API base URL

=== "Proxy (recommended)"

    ``` env
    VITE_MRI_API_URL=/api/mri
    ```

    Rewrites `/api/mri/:path*` → `http://127.0.0.1:8002/:path*` (WebSocket `/events` included).

## Dev server proxies

```ts title="vite.config.ts"
server: {
  port: 5173,
  strictPort: false,
  proxy: {
    "/api/dtam": {
      target: "http://127.0.0.1:8080",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/dtam/, ""),
    },
    "/api/agents": {
      target: "http://127.0.0.1:8001",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/agents/, ""),
    },
    "/api/mri": {
      target: "http://127.0.0.1:8002",
      changeOrigin: true,
      ws: true,
      rewrite: (path) => path.replace(/^\/api\/mri/, ""),
    },
  },
}
```

!!! warning "Port 3000"
    On many lab machines Grafana already listens on `*:3000`. Prefer Vite’s 5173 (or the next free port) rather than fighting for 3000.

## CAD mesh

Place STL/GLB files under `public/` and set `VITE_MAGNET_CAD_URL` to a site-root path (not a filesystem absolute path). Millimeter meshes often need `VITE_MAGNET_CAD_SCALE≈0.001`. Scale and offsets are also adjustable in the side panel and persisted in `localStorage`.

## Persisted client preferences

Several UI choices survive reloads via `localStorage` (launch intro uses `sessionStorage`). Settings that **actually apply** are listed first; most other Settings controls are a local draft only.

| Key | Purpose |
| --- | --- |
| `adelpha.workspacePrefs` | Startup workspace, restore layout, remember panel width |
| `adelpha_workspace_id` | Last selected workspace |
| `adelpha.consoleTheme` | `adelpha` or `mri4all` Imaging Console colors |
| `adelpha.scannerModel` | `halbach-48` / `halbach-47` / `halbach-64` / `mri4all-z1` |
| `adelpha-launch-seen` | **sessionStorage** — skip cinematic intro after first view in tab |
| `twin_side_panel_width_px` | Side panel width (px), if Remember side panel width is on |
| `twin_side_panel_collapsed` | Panel collapsed (`1` / absent), restored when Restore layout is on |
| `twin_side_panel_mode` | `telemetry` or `agents` tab |
| `twin_view_tool_rail_pos_v2` | Viewport tool rail `{x,y}` |
| `twin_magnet_cad_view_v2` | CAD exploded / wireframe / temp map |
| `twin_adk_model_id` | Selected Agents model |
| `twin_system_console_open` / `twin_system_console_tab` | Console visibility and Logging vs Terminal |
| `twin_face_mask_style` / `twin_camera_bg_mode` | Camera overlay preferences |

Replay the launch intro any time: append `?replayIntro=1` to the URL.

Software version in Status, About, and Settings is Adelpha **0.1.0** (`src/twin/adelphaVersion.ts`), not the MRI4ALL `VERSION` file.

## DTAM-side env (reference)

### Twin API (`make twin-api` → :8080)

| Variable | Typical |
| --- | --- |
| `DTAM_API_HOST` / `DTAM_API_PORT` | `127.0.0.1` / `8080` |
| `DTAM_CORS_ORIGINS` | Comma-separated browser origins |
| `DTAM_SCANNER_ID` | `simulated_scanner` |

### Agents API (`make agents-api` → :8001)

| Variable | Typical |
| --- | --- |
| `GOOGLE_API_KEY` | Gemini / Google AI key for ADK (repo-root `.env` or shell) |

The GUI never needs the Gemini key in its own `.env` — only the Agents API process does.
