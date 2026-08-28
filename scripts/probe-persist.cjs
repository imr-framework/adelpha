/** Throwaway: checks tab persistence, model persistence, and viewport part focus. */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.join(__dirname, "..", "dist");
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".glb": "model/gltf-binary",
  ".stl": "model/stl",
  ".json": "application/json",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || "/").split("?")[0]);
      let file = path.join(ROOT, url === "/" ? "index.html" : url);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, "index.html");
      res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const openSettings = `document.querySelector('.topbar-icon-btn[aria-controls="settings-card"]').click(); true`;
const activeTab = `(document.querySelector('.sw-tab.is-active') || {}).textContent`;

async function run() {
  const { server, port } = await serve();
  const win = new BrowserWindow({ width: 1440, height: 900, show: true });
  win.webContents.on("console-message", (_e, _level, message) => {
    if (message.includes("focus-debug")) console.log(message);
  });
  await win.loadURL(`http://127.0.0.1:${port}/`);
  await win.webContents.executeJavaScript(
    `localStorage.setItem('adelpha-launch-seen','1'); sessionStorage.setItem('adelpha-launch-seen','1'); localStorage.setItem('adelpha.scannerModel','delta-v2'); true`,
  );
  await win.webContents.reload();
  await sleep(7000);

  await win.webContents.executeJavaScript(openSettings);
  await sleep(800);
  await win.webContents.executeJavaScript(`document.getElementById('sw-tab-sensors').click(); true`);
  await sleep(500);
  console.log("picked:", await win.webContents.executeJavaScript(activeTab));

  // Close and reopen: the tab choice must survive.
  await win.webContents.executeJavaScript(`document.querySelector('.settings-back').click(); true`);
  await sleep(600);
  await win.webContents.executeJavaScript(openSettings);
  await sleep(900);
  console.log("after reopen:", await win.webContents.executeJavaScript(activeTab));
  console.log(
    "stored tab:",
    await win.webContents.executeJavaScript(`localStorage.getItem('adelpha.settings.modelTab')`),
  );

  // Full reload: the scanner choice must survive too.
  await win.webContents.reload();
  await sleep(7000);
  await win.webContents.executeJavaScript(openSettings);
  await sleep(900);
  console.log("after reload tab:", await win.webContents.executeJavaScript(activeTab));
  console.log(
    "scanner:",
    await win.webContents.executeJavaScript(`localStorage.getItem('adelpha.scannerModel')`),
  );

  // Frame a part: settings must close and the camera must move.
  await win.webContents.executeJavaScript(`document.getElementById('sw-tab-components').click(); true`);
  await sleep(900);
  const framed = await win.webContents.executeJavaScript(
    `(() => { const btns = [...document.querySelectorAll('.sw-row .sw-icon-btn')].filter((b) => (b.getAttribute('aria-label')||'').startsWith('Frame Rings')); if (!btns[0]) return 'no button'; btns[0].click(); return btns[0].getAttribute('aria-label'); })()`,
  );
  console.log("framed:", framed);
  await sleep(2500);
  // Isolate + focus: the part must be alone, highlighted, and filling the frame.
  await win.webContents.executeJavaScript(openSettings);
  await sleep(900);
  await win.webContents.executeJavaScript(
    `(() => { const b = [...document.querySelectorAll('.settings-btn')].find((x) => x.textContent.trim() === 'Isolate'); if (b) b.click(); return Boolean(b); })()`,
  );
  await sleep(400);
  await win.webContents.executeJavaScript(
    `(() => { const b = [...document.querySelectorAll('.settings-btn')].find((x) => x.textContent.trim() === 'Focus'); if (b) b.click(); return Boolean(b); })()`,
  );
  await sleep(2500);
  const isolated = await win.webContents.capturePage();
  fs.writeFileSync(
    path.join(__dirname, "..", ".cache", "settings-shots", "41-isolated-part.png"),
    isolated.toPNG(),
  );
  console.log(
    "settings closed:",
    await win.webContents.executeJavaScript(`!document.querySelector('.settings-overlay')`),
  );
  console.log(
    "part card:",
    await win.webContents.executeJavaScript(
      `(document.querySelector('.part-inspect-title') || {}).textContent || null`,
    ),
  );
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, "..", ".cache", "settings-shots", "40-framed-part.png"), image.toPNG());

  server.close();
  app.quit();
}

app.whenReady().then(() => run().catch((e) => (console.error(e), app.exit(1))));
