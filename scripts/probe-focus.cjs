/** Throwaway: reports where Tab lands inside the component browser and what ring it draws. */
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

const PROBE = `(() => {
  const el = document.activeElement;
  const style = getComputedStyle(el);
  return {
    tag: el.tagName,
    cls: el.className && el.className.toString().slice(0, 60),
    label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
    focusVisible: el.matches(':focus-visible'),
    outline: style.outline,
    boxShadow: style.boxShadow.slice(0, 60),
  };
})()`;

async function run() {
  const { server, port } = await serve();
  const win = new BrowserWindow({ width: 1440, height: 900, show: true });
  await win.loadURL(`http://127.0.0.1:${port}/`);
  await win.webContents.executeJavaScript(
    `localStorage.setItem('adelpha-launch-seen','1'); sessionStorage.setItem('adelpha-launch-seen','1'); localStorage.setItem('adelpha.scannerModel','"delta-v2"'); true`,
  );
  await win.webContents.reload();
  await sleep(6000);
  await win.webContents.executeJavaScript(
    `document.querySelector('.topbar-icon-btn[aria-controls="settings-card"]').click(); true`,
  );
  await sleep(900);
  await win.webContents.executeJavaScript(`document.getElementById('sw-tab-components').click(); true`);
  await sleep(900);
  await win.webContents.executeJavaScript(`document.querySelector('.sw-search input').focus(); true`);
  await sleep(200);

  // :focus-visible needs trusted keyboard input, which sendInputEvent does not
  // provide, so mirror the ring onto :focus purely to photograph it.
  await win.webContents.insertCSS(
    `.settings-overlay :focus { outline: 2px solid rgba(157, 130, 255, 0.85) !important; outline-offset: 2px !important; }`,
  );

  for (let i = 0; i < 8; i += 1) {
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
    await sleep(200);
    console.log(i, JSON.stringify(await win.webContents.executeJavaScript(PROBE)));
  }

  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, "..", ".cache", "settings-shots", "37-focus-probe.png"), image.toPNG());

  server.close();
  app.quit();
}

app.whenReady().then(() => run().catch((e) => (console.error(e), app.exit(1))));
