# Electron → Tauri migration notes

Electron remains in `electron/` and `package.json` `electron:*` / `dist:*`
scripts until a platform installer has demonstrated parity. The Tauri
production bundle does **not** ship Electron, `node-pty`, or electron-builder.

## Feature map

| Electron | Tauri |
| --- | --- |
| `electron/main.cjs` loopback static server | Webview loads Vite `devUrl` or `frontendDist` |
| Proxy `/api/dtam\|agents\|mri` to fixed ports | Supervisor gateway; frontend uses injected `base_url` |
| `node-pty` + `preload.cjs` | Rust `portable-pty`; same `window.adelphaTerminal` shape |
| `adelphaApp.quit` | `invoke('app_quit')` then sidecar shutdown |
| Camera `NSCameraUsageDescription` | `bundle.macOS.infoPlist` |
| Window 1440×900, min 1024×700, `#050505` | Same in `src-tauri/tauri.conf.json` |
| electron-builder dmg/nsis/AppImage/deb | Tauri bundle targets `dmg`, `nsis`, `appimage`, `deb` |
| `org.adelpha.digital-twin-ui` | Same identifier |

## Intentionally not copied

- Unrestricted `shell.openExternal` for arbitrary URLs still uses the webview
  default; typed commands do not expose `shell.execute`.
- Electron’s GPU command-line switches have no Tauri equivalent; WebView
  defaults apply.
- `asarUnpack` / `afterPack.cjs` for `node-pty` are Electron-only.

## Frontend

`src/desktop/runtime.ts` detects Tauri via `__TAURI_INTERNALS__`. Browser Vite
and Electron keep relative `/api/*` URLs. Tauri prefixes the supervisor origin
and sends `Authorization: Bearer <session>`.

## Removing Electron

After a signed-off installer smoke test on each OS:

1. Delete `electron/`, electron-builder `build` key, `electron` / `electron-builder` / `node-pty` dependencies.
2. Remove `postinstall`: `electron-builder install-app-deps`.
3. Drop `electron:*` and `dist:*` scripts.
4. Rewrite README badges that still mention Electron.
