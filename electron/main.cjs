/**
 * Electron shell for the Adelpha Digital Twin UI.
 * Serves the Vite `dist/` build on a loopback port and proxies:
 *   /api/dtam/*  → Twin API  (default http://127.0.0.1:8080)
 *   /api/agents/* → Agents API (default http://127.0.0.1:8001)
 */
const { app, BrowserWindow, shell } = require("electron");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const TWIN_TARGET = process.env.DTAM_TWIN_URL || "http://127.0.0.1:8080";
const AGENTS_TARGET = process.env.DTAM_AGENTS_URL || "http://127.0.0.1:8001";

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

function distRoot() {
  return path.join(app.getAppPath(), "dist");
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
        detail: `Upstream ${targetBase} unreachable (${err.message}). Is the DTAM API running?`,
      }),
    );
  });

  req.pipe(upstream);
}

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
    filePath = path.join(root, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found — run npm run build before launching Electron.");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
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
      serveStatic(req, res, root);
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

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Adelpha Digital Twin",
    backgroundColor: "#050505",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await win.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(() => {
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
  if (localServer) {
    localServer.close();
    localServer = null;
  }
  if (process.platform !== "darwin") app.quit();
});
