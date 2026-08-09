---
icon: lucide/settings-2
---

# Configuration

## Environment

Copy `.env.example` to `.env.local` (Vite loads `.env.local` automatically). Defaults already match the recommended proxy setup.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_DTAM_API_URL` | `/api/dtam` | Twin API base (proxy path or absolute URL) |
| `VITE_ADK_API_URL` | `/api/agents` | Agents (ADK) API base |
| `VITE_ADK_APP_NAME` | `dtam` | ADK app from `GET /list-apps` |
| `VITE_ADK_USER_ID` | `gui-user` | Local demo user id for ADK sessions |
| `VITE_ADK_MODELS` | built-in list | Optional `id:Label,...` model picker |
| `VITE_ADK_MODEL` | first model | Default selected model id |
| `VITE_MAGNET_CAD_URL` | unset | Public URL for magnet mesh (e.g. `/MRI_base.stl`) |
| `VITE_MAGNET_CAD_SCALE` | inferred | Uniform scale after centering |
| `VITE_MAGNET_CAD_RX_DEG` / `RY` / `RZ` | `0` | Orientation offsets |

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
  },
}
```

!!! warning "Port 3000"
    On many lab machines Grafana already listens on `*:3000`. Prefer Vite’s 5173 (or the next free port) rather than fighting for 3000.

## CAD mesh

Place STL/GLB files under `public/` and set `VITE_MAGNET_CAD_URL` to a site-root path (not a filesystem absolute path). Millimeter meshes often need `VITE_MAGNET_CAD_SCALE≈0.001`. Scale and offsets are also adjustable in the side panel and persisted in `localStorage`.

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
