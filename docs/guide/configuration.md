---
icon: lucide/settings-2
---

# Configuration

Day-to-day controls live in **[Settings](settings.md)**. This page is the developer reference: environment variables and what is stored on disk.

## Desktop vs browser

The packaged app (and `make tauri-dev`) starts a Python supervisor on `127.0.0.1` with an **ephemeral port**. The window receives a base URL and a session token. You do not set Twin/MRI ports by hand.

`npm run dev` still uses Vite proxies to `:8080`, `:8001`, and `:8002`.

The Google API key belongs in **Settings → AI & Agents**, which writes `<app-config>/google_api_key`. Do not put keys in the installer.

## Optional Vite env

Create `.env.local` only if you must override defaults.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_DTAM_API_URL` | `/api/dtam` | Twin API |
| `VITE_ADK_API_URL` | `/api/agents` | Agents API |
| `VITE_MRI_API_URL` | `/api/mri` | MRI console API |
| `VITE_ADK_APP_NAME` | `dtam` | ADK app name |
| `VITE_ADK_USER_ID` | `gui-user` | Demo user for ADK sessions |
| `VITE_ADK_MODELS` | built-in list | Optional `id:Label,...` |
| `VITE_ADK_MODEL` | first model | Default model id |
| `VITE_MAGNET_CAD_URL` | unset | Legacy public URL for a single mesh |

Imported CAD no longer needs `VITE_MAGNET_CAD_URL`. Use **Settings → 3D Model → Files**.

### Proxies (`npm run dev`)

`/api/dtam` → `:8080`, `/api/agents` → `:8001`, `/api/mri` → `:8002` (WebSocket included). Vite is pinned to **5173** so Tauri can find it. Avoid port 3000 on lab machines that already run Grafana.

If you set an absolute `VITE_DTAM_API_URL` (no proxy), add the Vite origin to DTAM `DTAM_CORS_ORIGINS`.

## DTAM runtime (desktop)

Saved as `dtam_runtime.json` in the app config directory:

| Field | Role |
| --- | --- |
| `scanner_id` | e.g. `simulated_scanner` |
| `environment` | e.g. `development` |
| `agent_model` / `agent_mode` | Gemini model and mode |

Saving these restarts the Python runtime. User YAML under the config `dtam/` folder wins over the bundled copies.

## MRI console (`mri4all.json`)

Under the MRI data directory (`<app-data>/mri4all/config/` in the desktop app):

| Field | Role |
| --- | --- |
| `scanner_ip` | Red Pitaya / MaRCoS host |
| `hardware_simulation` | `"True"` / `"False"` |
| `debug_mode` | `"True"` / `"False"` |
| `dicom_targets` | Export destinations |

Ping always probes the network. Sequences talk to hardware only when simulation is **False**. See [Imaging Console](imaging-console.md#red-pitaya).

## Persisted UI preferences

| Key | Purpose |
| --- | --- |
| `adelpha.workspacePrefs` | Startup workspace, restore layout, panel width |
| `adelpha_workspace_id` | Last workspace |
| `adelpha.consoleTheme` | `adelpha` or `mri4all` |
| `adelpha.scannerModel` | Active model id (bundled or `imported-…`) |
| `adelpha.importedModels` | Catalog of imported CAD (blobs are in IndexedDB `adelpha-cad`) |
| `adelpha.devicePreviews` | Optional device pictures |
| `adelpha-launch-seen` | Skip intro (desktop: localStorage; browser: sessionStorage) |
| `twin_magnet_cad_view_v2` | Explode / wireframe / temp map / scale |
| `twin_view_tool_rail_pos_v2` | Tool rail position |
| `twin_adk_model_id` | Agents model (legacy picker) |
| `twin_face_mask_style` / `twin_camera_bg_mode` | Camera overlay |

Software version in About and Status comes from `src/twin/adelphaVersion.ts`. The installer version is `src-tauri/tauri.conf.json`.

## DTAM process env (browser / extra terminals)

| Variable | Typical |
| --- | --- |
| `DTAM_API_HOST` / `DTAM_API_PORT` | `127.0.0.1` / `8080` |
| `DTAM_SCANNER_ID` | `simulated_scanner` |
| `GOOGLE_API_KEY` | Agents API only |
