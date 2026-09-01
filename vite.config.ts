import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  version: string;
};

/** Ship MediaPipe WASM next to the UI so the packaged WebView does not load jsDelivr. */
function mediapipeWasm(): Plugin {
  const src = resolve(root, "node_modules/@mediapipe/tasks-vision/wasm");
  const dest = resolve(root, "public/mediapipe/wasm");
  const copy = () => {
    if (!existsSync(src)) return;
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true });
  };
  return { name: "mediapipe-wasm", buildStart: copy };
}

export default defineConfig({
  plugins: [react(), mediapipeWasm()],
  define: {
    __ADELPHA_VERSION__: JSON.stringify(pkg.version),
  },
  assetsInclude: ["**/*.wasm"],
  optimizeDeps: {
    exclude: ["occt-import-js"],
  },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "chrome132",
    cssTarget: "chrome132",
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three") || id.includes("@react-three") || id.includes("three-stdlib")) {
            return "three";
          }
          if (id.includes("@mediapipe")) return "mediapipe";
          if (id.includes("@xterm")) return "xterm";
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
            return "react";
          }
        },
      },
    },
  },
  server: {
    // Prefer 5173; if busy (e.g. leftover Vite), try next ports.
    // Avoid 3000 — Grafana often owns *:3000 on this machine.
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**", "**/packaging/**"],
    },
    proxy: {
      // Twin HTTP API (make twin-api → :8080)
      "/api/dtam": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/dtam/, ""),
      },
      // Google ADK API (make agents-api → :8001)
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
  },
});
