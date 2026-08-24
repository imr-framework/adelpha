/**
 * Electron shell for the Adelpha Digital Twin UI.
 * Serves the Vite `dist/` build on a loopback port and proxies:
 *   /api/dtam/*  → Twin API  (default http://127.0.0.1:8080)
 *   /api/agents/* → Agents API (default http://127.0.0.1:8001)
 *   /api/mri/*   → MRI4ALL API (default http://127.0.0.1:8002)
 * Hosts a real shell PTY for the in-app xterm terminal.
 */
const { app, BrowserWindow, shell, ipcMain, session, systemPreferences } = require("electron");
const http = require("http");
const https = require("https");
const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { URL } = require("url");
const pty = require("node-pty");

const TWIN_TARGET = process.env.DTAM_TWIN_URL || "http://127.0.0.1:8080";
const AGENTS_TARGET = process.env.DTAM_AGENTS_URL || "http://127.0.0.1:8001";
const MRI_TARGET = process.env.MRI4ALL_API_URL || "http://127.0.0.1:8002";
const STATIC_CACHE_MAX_BYTES = 8 * 1024 * 1024;

app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
  ".tflite": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".stl": "application/octet-stream",
};

/** @type {Map<number, import('node-pty').IPty>} */
const ptySessions = new Map();

function defaultShell() {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "powershell.exe";
  }
  return process.env.SHELL || "/bin/zsh";
}

function disposePty(webContentsId) {
  const session = ptySessions.get(webContentsId);
  if (!session) return;
  try {
    session.kill();
  } catch {
    /* ignore */
  }
  ptySessions.delete(webContentsId);
}

function registerTerminalIpc() {
  ipcMain.handle("terminal:start", (event, { cols, rows } = {}) => {
    const sender = event.sender;
    const id = sender.id;
    disposePty(id);

    try {
      const shellPath = defaultShell();
      const cwd = app.getPath("home") || os.homedir();
      const session = pty.spawn(shellPath, [], {
        name: "xterm-256color",
        cols: Math.max(20, cols || 80),
        rows: Math.max(5, rows || 24),
        cwd,
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
      });

      session.onData((data) => {
        if (!sender.isDestroyed()) sender.send("terminal:data", data);
      });

      session.onExit(({ exitCode }) => {
        ptySessions.delete(id);
        if (!sender.isDestroyed()) sender.send("terminal:exit", exitCode ?? 0);
      });

      ptySessions.set(id, session);
      return { ok: true, shell: shellPath, cwd };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.on("terminal:write", (event, data) => {
    const session = ptySessions.get(event.sender.id);
    if (!session || typeof data !== "string") return;
    try {
      session.write(data);
    } catch {
      /* ignore */
    }
  });

  ipcMain.on("terminal:resize", (event, { cols, rows } = {}) => {
    const session = ptySessions.get(event.sender.id);
    if (!session) return;
    const nextCols = Math.max(20, cols || 80);
    const nextRows = Math.max(5, rows || 24);
    if (session.cols === nextCols && session.rows === nextRows) return;
    try {
      session.resize(nextCols, nextRows);
    } catch {
      /* ignore */
    }
  });

  ipcMain.on("terminal:dispose", (event) => {
    disposePty(event.sender.id);
  });

  ipcMain.on("app:quit", () => {
    app.quit();
  });
}

function registerMediaPermissions() {
  const ses = session.defaultSession;

  // Without these, Chromium denies getUserMedia silently — no macOS camera prompt.
  ses.setPermissionCheckHandler((_wc, permission) => {
    return permission === "media" || permission === "mediaKeySystem" || permission === "fullscreen";
  });

  ses.setPermissionRequestHandler(async (_wc, permission, callback) => {
    if (permission !== "media" && permission !== "mediaKeySystem") {
      callback(false);
      return;
    }
    if (process.platform === "darwin") {
      try {
        const status = systemPreferences.getMediaAccessStatus("camera");
        if (status === "granted") {
          callback(true);
          return;
        }
        if (status === "denied" || status === "restricted") {
          console.warn(
            `[adelpha] Camera access is ${status}. Enable it in System Settings → Privacy & Security → Camera.`,
          );
          callback(false);
          return;
        }
        const granted = await systemPreferences.askForMediaAccess("camera");
        callback(Boolean(granted));
        return;
      } catch (err) {
        console.warn("[adelpha] Camera permission request failed:", err);
        callback(false);
        return;
      }
    }
    callback(true);
  });

  if (typeof ses.setDevicePermissionHandler === "function") {
    ses.setDevicePermissionHandler((details) => details.deviceType === "videoInput");
  }
}

function distRoot() {
  const packed = path.join(app.getAppPath(), "dist");
  const unpacked = packed.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
  if (unpacked !== packed && fs.existsSync(path.join(unpacked, "index.html"))) {
    return unpacked;
  }
  return packed;
}

function proxyRequest(req, res, targetBase, stripPrefix) {
  const incoming = new URL(req.url || "/", "http://127.0.0.1");
  const rewritten = incoming.pathname.replace(stripPrefix, "") || "/";
  const target = new URL(rewritten + incoming.search, targetBase);
  const lib = target.protocol === "https:" ? https : http;

  const headers = { ...req.headers, host: target.host };
  delete headers["origin"];
  delete headers["referer"];

  const upstream = lib.request(
    target,
    { method: req.method, headers },
    (upRes) => {
      res.writeHead(upRes.statusCode || 502, upRes.headers);
      upRes.pipe(res);
    },
  );

  upstream.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
    }
    res.end(
      JSON.stringify({
        detail: `Upstream ${targetBase} unreachable (${err.message}). Is the API running?`,
      }),
    );
  });

  req.pipe(upstream);
}

function proxyWebSocket(req, socket, head, targetBase, stripPrefix) {
  const incoming = new URL(req.url || "/", "http://127.0.0.1");
  const rewritten = incoming.pathname.replace(stripPrefix, "") || "/";
  const target = new URL(rewritten + incoming.search, targetBase);
  const port = Number(target.port) || (target.protocol === "https:" ? 443 : 80);
  const upstream = net.connect(port, target.hostname, () => {
    const headerLines = Object.entries(req.headers)
      .filter(([key]) => {
        const k = key.toLowerCase();
        return k !== "origin" && k !== "referer" && k !== "host";
      })
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
    upstream.write(
      `GET ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${target.host}\r\n${headerLines.join("\r\n")}\r\n\r\n`,
    );
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
}

/** @type {Map<string, { mime: string, data: Buffer, immutable: boolean }>} */
const staticCache = new Map();

function serveStatic(req, res, root) {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let rel = urlPath === "/" ? "/index.html" : urlPath;
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(root, rel);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const extMissing = path.extname(rel).toLowerCase();
    if (extMissing && extMissing !== ".html") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    filePath = path.join(root, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found — run npm run build before launching Electron.");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  const immutable = ext === ".js" || ext === ".css" || ext === ".wasm" || ext === ".woff2";
  const cacheControl =
    ext === ".html" || urlPath === "/" ? "no-cache" : immutable ? "public, max-age=31536000, immutable" : "public, max-age=86400";

  let payload = staticCache.get(filePath);
  if (!payload) {
    const data = fs.readFileSync(filePath);
    payload = { mime, data, immutable };
    if (data.length <= STATIC_CACHE_MAX_BYTES) staticCache.set(filePath, payload);
  }

  res.writeHead(200, {
    "content-type": payload.mime,
    "content-length": payload.data.length,
    "cache-control": cacheControl,
  });
  res.end(payload.data);
}

function createLocalServer() {
  const root = distRoot();
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const pathname = (req.url || "/").split("?")[0];
      if (pathname.startsWith("/api/dtam")) {
        proxyRequest(req, res, TWIN_TARGET, /^\/api\/dtam/);
        return;
      }
      if (pathname.startsWith("/api/agents")) {
        proxyRequest(req, res, AGENTS_TARGET, /^\/api\/agents/);
        return;
      }
      if (pathname.startsWith("/api/mri")) {
        proxyRequest(req, res, MRI_TARGET, /^\/api\/mri/);
        return;
      }
      serveStatic(req, res, root);
    });

    server.on("upgrade", (req, socket, head) => {
      const pathname = (req.url || "/").split("?")[0];
      if (pathname.startsWith("/api/mri")) {
        proxyWebSocket(req, socket, head, MRI_TARGET, /^\/api\/mri/);
        return;
      }
      socket.destroy();
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, port: addr.port, root });
    });
  });
}

/** @type {import('http').Server | null} */
let localServer = null;

async function createWindow() {
  const { server, port, root } = await createLocalServer();
  localServer = server;

  if (!fs.existsSync(path.join(root, "index.html"))) {
    console.error(`[adelpha] Missing ${path.join(root, "index.html")}. Run: npm run build`);
  }

  const iconPath = path.join(__dirname, "build", "icon.png");
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Adelpha Digital Twin",
    icon: iconPath,
    backgroundColor: "#050505",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
      v8CacheOptions: "bypassHeatCheck",
    },
  });

  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
  });

  win.webContents.on("destroyed", () => {
    disposePty(win.webContents.id);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await win.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(() => {
  const iconPath = path.join(__dirname, "build", "icon.png");
  if (process.platform === "darwin" && app.dock && fs.existsSync(iconPath)) {
    app.dock.setIcon(iconPath);
  }
  registerMediaPermissions();
  registerTerminalIpc();
  createWindow().catch((err) => {
    console.error(err);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch(console.error);
    }
  });
});

app.on("window-all-closed", () => {
  for (const id of [...ptySessions.keys()]) disposePty(id);
  if (localServer) {
    localServer.close();
    localServer = null;
  }
  if (process.platform !== "darwin") app.quit();
});
