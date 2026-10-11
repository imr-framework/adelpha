import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import net from "node:net";
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

type DevBackend = {
  prefix: string;
  port: number;
  name: string;
  hint: string;
};

const DEV_BACKENDS: DevBackend[] = [
  { prefix: "/api/dtam", port: 8080, name: "Twin API", hint: "cd dtam && make twin-api" },
  { prefix: "/api/agents", port: 8001, name: "Agents API", hint: "cd dtam && make agents-api" },
  { prefix: "/api/mri", port: 8002, name: "Imaging Console API", hint: "cd console && python -m services.api" },
];

function probePort(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolveUp) => {
    const sock = net.connect({ port, host }, () => {
      sock.end();
      resolveUp(true);
    });
    sock.setTimeout(250);
    sock.on("timeout", () => {
      sock.destroy();
      resolveUp(false);
    });
    sock.on("error", () => resolveUp(false));
  });
}

function watchPort(port: number, host = "127.0.0.1") {
  let up = false;
  const probe = () => {
    const sock = net.connect({ port, host }, () => {
      up = true;
      sock.end();
    });
    sock.setTimeout(250);
    sock.on("timeout", () => {
      up = false;
      sock.destroy();
    });
    sock.on("error", () => {
      up = false;
    });
  };
  probe();
  const id = setInterval(probe, 2000);
  return {
    get up() {
      return up;
    },
    stop() {
      clearInterval(id);
    },
  };
}

/** Skip Vite's HTTP proxy when a backend is down so the terminal is not flooded with ECONNREFUSED. */
function backendProxyGuard(): Plugin {
  return {
    name: "backend-proxy-guard",
    apply: "serve",
    configureServer(server) {
      const watches = DEV_BACKENDS.map((backend) => ({ ...backend, watch: watchPort(backend.port) }));
      server.httpServer?.once("close", () => {
        for (const item of watches) item.watch.stop();
      });
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        const hit = watches.find((item) => url.startsWith(item.prefix));
        if (!hit || hit.watch.up) {
          next();
          return;
        }
        res.statusCode = 503;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            detail: `${hit.name} is not running on :${hit.port}. Start it with: ${hit.hint}`,
          }),
        );
      });
    },
  };
}

/** Browser requests go through Vite → :8080. Start Twin there when `make tauri-dev` did not. */
function ensureTwinApi(): Plugin {
  return {
    name: "ensure-twin-api",
    apply: "serve",
    async configureServer(server) {
      if (await probePort(8080)) {
        server.config.logger.info("Twin API already listening on :8080");
        return;
      }
      const dtam = resolve(root, "dtam");
      const venvPython = resolve(dtam, ".venv/bin/python");
      const command = existsSync(venvPython) ? venvPython : "uv";
      const args = existsSync(venvPython) ? ["-m", "dtam.api"] : ["run", "python", "-m", "dtam.api"];
      server.config.logger.info("starting Twin API on :8080 for the Vite proxy");
      const child: ChildProcess = spawn(command, args, {
        cwd: dtam,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          DTAM_CONFIG_DIR: resolve(dtam, "configs"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const prefix = "[twin-api]";
      child.stdout?.on("data", (buf: Buffer) => {
        const text = String(buf).trim();
        if (text) server.config.logger.info(`${prefix} ${text}`);
      });
      child.stderr?.on("data", (buf: Buffer) => {
        const text = String(buf).trim();
        if (text) server.config.logger.info(`${prefix} ${text}`);
      });
      child.on("exit", (code, signal) => {
        if (code || signal) {
          server.config.logger.warn(`${prefix} exited (${signal ?? code}). ${DEV_BACKENDS[0].hint}`);
        }
      });
      server.httpServer?.once("close", () => {
        child.kill();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), mediapipeWasm(), backendProxyGuard(), ensureTwinApi()],
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
      ignored: ["**/src-tauri/**", "**/packaging/**", "**/.venv/**", "**/site/**"],
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
