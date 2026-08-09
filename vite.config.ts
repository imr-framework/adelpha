import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Prefer 5173; if busy (e.g. leftover Vite), try next ports.
    // Avoid 3000 — Grafana often owns *:3000 on this machine.
    port: 5173,
    strictPort: false,
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
    },
  },
});
