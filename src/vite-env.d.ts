/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public URL for exported magnet mesh (e.g. `/magnet.glb` or `/magnet.stl`). */
  readonly VITE_MAGNET_CAD_URL?: string;
  /** Uniform scale applied after centering (use ~0.001 if the mesh is in millimeters). */
  readonly VITE_MAGNET_CAD_SCALE?: string;
  readonly VITE_MAGNET_CAD_RX_DEG?: string;
  readonly VITE_MAGNET_CAD_RY_DEG?: string;
  readonly VITE_MAGNET_CAD_RZ_DEG?: string;
  /** DTAM Twin API base (`/api/dtam` via Vite proxy, or `http://127.0.0.1:8080`). */
  readonly VITE_DTAM_API_URL?: string;
  /** Google ADK API base (`/api/agents` via Vite proxy → :8001). */
  readonly VITE_ADK_API_URL?: string;
  /** ADK app name from GET /list-apps (default dtam). */
  readonly VITE_ADK_APP_NAME?: string;
  /** Fixed local demo user id for ADK sessions. */
  readonly VITE_ADK_USER_ID?: string;
  /** Comma-separated model options `id:Label,...` for the Agents picker. */
  readonly VITE_ADK_MODELS?: string;
  /** MRI4ALL console API (`/api/mri` via Vite proxy or the Tauri supervisor). */
  readonly VITE_MRI_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Electron preload or Tauri PTY bridge for a real shell (absent in browser Vite). */
interface AdelphaTerminalBridge {
  available: true;
  start: (
    cols: number,
    rows: number,
  ) => Promise<{ ok: boolean; shell?: string; cwd?: string; error?: string }>;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  dispose: () => void;
  onData: (cb: (data: string) => void) => () => void;
  onExit: (cb: (code: number) => void) => () => void;
}

interface Window {
  adelphaTerminal?: AdelphaTerminalBridge;
  adelphaApp?: {
    quit: () => void;
  };
}
