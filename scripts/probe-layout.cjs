/** Throwaway: measures the components tab layout so fill mode can be verified. */
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

const MEASURE = `(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      sel,
      h: Math.round(r.height),
      bottom: Math.round(r.bottom),
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
      scrollable: el.scrollHeight > el.clientHeight + 1,
    };
  };
  return {
    rows: document.querySelectorAll('.sw-row').length,
    fill: Boolean(document.querySelector('.settings-page.is-fill')),
    viewportH: window.innerHeight,
    nodes: ['.settings-page-scroll', '.settings-page-content', '.sw-tabpanel', '.sw-components', '.sw-components-split', '.sw-browser', '.sw-table-scroll', '.sw-inspector'].map(pick),
  };
})()`;

async function run() {
  const { server, port } = await serve();
  const win = new BrowserWindow({ width: 1440, height: 900, show: true });
  await win.loadURL(`http://127.0.0.1:${port}/`);
  await win.webContents.executeJavaScript(
    `localStorage.setItem('adelpha-launch-seen','1'); sessionStorage.setItem('adelpha-launch-seen','1'); localStorage.setItem('adelpha.scannerModel','delta-v2'); true`,
  );
  await win.webContents.reload();
  await sleep(7000);
  await win.webContents.executeJavaScript(
    `document.querySelector('.topbar-icon-btn[aria-controls="settings-card"]').click(); true`,
  );
  await sleep(900);
  await win.webContents.executeJavaScript(`document.getElementById('sw-tab-components').click(); true`);
  await sleep(1200);
  console.log("NO SELECTION", JSON.stringify(await win.webContents.executeJavaScript(MEASURE), null, 1));
  await win.webContents.executeJavaScript(
    `(() => { const b = document.querySelector('.sw-row-select'); if (b) b.click(); return true; })()`,
  );
  await sleep(700);
  console.log("SELECTED", JSON.stringify(await win.webContents.executeJavaScript(MEASURE), null, 1));
  server.close();
  app.quit();
}

app.whenReady().then(() => run().catch((e) => (console.error(e), app.exit(1))));
