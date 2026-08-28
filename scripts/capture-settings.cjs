/**
 * Throwaway visual-verification harness.
 * Serves dist/, opens the app in Electron, walks the 3D Model settings tabs, and
 * writes PNGs to .cache/settings-shots/. Not part of the app or the build.
 */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.join(__dirname, "..", "dist");
const OUT = path.join(__dirname, "..", ".cache", "settings-shots");
const SIZES = (process.env.SHOT_SIZES || "1440x900").split(",").map((s) => {
  const [w, h] = s.split("x").map(Number);
  return { w, h };
});

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

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || "/").split("?")[0]);
      let file = path.join(ROOT, url === "/" ? "index.html" : url);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(ROOT, "index.html");
      }
      res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(win, name) {
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, `${name}.png`), image.toPNG());
  console.log("saved", name);
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const { server, port } = await serve();

  for (const size of SIZES) {
    const win = new BrowserWindow({
      width: size.w,
      height: size.h,
      show: true,
      backgroundColor: "#050505",
      webPreferences: { contextIsolation: true, sandbox: true, offscreen: false },
    });
    win.webContents.on("console-message", (_e, level, message) => {
      if (level >= 2) console.log("[page]", message);
    });

    await win.loadURL(`http://127.0.0.1:${port}/`);
    await win.webContents.executeJavaScript(
      `sessionStorage.setItem('adelpha-launch-seen','1'); localStorage.setItem('adelpha-launch-seen','1'); true`,
    );
    await win.webContents.reload();
    await sleep(3500);

    const tag = `${size.w}x${size.h}`;
    await shot(win, `00-shell-${tag}`);

    // Open settings from the topbar gear.
    await win.webContents.executeJavaScript(
      `document.querySelector('.topbar-icon-btn[aria-controls="settings-card"]').click(); true`,
    );
    await sleep(900);

    const tabs = ["general", "components", "sensors", "visualization", "performance", "files"];
    for (const tabId of tabs) {
      await win.webContents.executeJavaScript(
        `(() => { const el = document.getElementById('sw-tab-${tabId}'); if (el) el.click(); return Boolean(el); })()`,
      );
      await sleep(700);
      await shot(win, `10-${tabId}-${tag}`);

      if (tabId === "components") {
        const picked = await win.webContents.executeJavaScript(
          `(() => { const b = document.querySelector('.sw-row-select'); if (b) b.click(); return Boolean(b); })()`,
        );
        if (picked) {
          await sleep(600);
          await shot(win, `11-components-selected-${tag}`);
        }
        // Scroll the page body to prove nothing hides under the head.
        await win.webContents.executeJavaScript(
          `document.querySelector('.settings-page-scroll').scrollTop = 400; true`,
        );
        await sleep(400);
        await shot(win, `12-components-scrolled-${tag}`);
      }

      if (tabId === "visualization" || tabId === "general") {
        await win.webContents.executeJavaScript(
          `document.querySelector('.settings-page-scroll').scrollTop = 99999; true`,
        );
        await sleep(400);
        await shot(win, `13-${tabId}-bottom-${tag}`);
        await win.webContents.executeJavaScript(
          `document.querySelector('.settings-page-scroll').scrollTop = 260; true`,
        );
        await sleep(400);
        await shot(win, `14-${tabId}-mid-scroll-${tag}`);
      }
    }

    // Another settings section, to confirm the shared shell still reads well.
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.settings-nav-item')].find((b) => b.textContent.trim() === 'Digital Twin').click(); true`,
    );
    await sleep(600);
    await shot(win, `20-digital-twin-${tag}`);

    // Multi-part assembly: switch to Delta, let the viewport register its parts, come back.
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.settings-nav-item')].find((b) => b.textContent.trim() === '3D Model').click(); true`,
    );
    await sleep(400);
    await win.webContents.executeJavaScript(
      `document.getElementById('sw-tab-general').click(); true`,
    );
    await sleep(400);
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.sw-family-card')].find((b) => b.textContent.includes('Delta')).click(); true`,
    );
    await sleep(600);
    await win.webContents.executeJavaScript(`document.querySelector('.settings-back').click(); true`);
    await sleep(6000);
    await shot(win, `30-delta-viewport-${tag}`);

    await win.webContents.executeJavaScript(
      `document.querySelector('.topbar-icon-btn[aria-controls="settings-card"]').click(); true`,
    );
    await sleep(900);
    await win.webContents.executeJavaScript(
      `document.getElementById('sw-tab-components').click(); true`,
    );
    await sleep(800);
    await shot(win, `31-delta-components-${tag}`);

    await win.webContents.executeJavaScript(
      `(() => { const b = document.querySelectorAll('.sw-row-select')[2]; if (b) b.click(); return Boolean(b); })()`,
    );
    await sleep(600);
    await shot(win, `32-delta-selected-${tag}`);

    // Hide one part, then search, to exercise the muted/hidden row states.
    await win.webContents.executeJavaScript(
      `(() => { const b = document.querySelectorAll('.sw-row .sw-icon-btn')[0]; if (b) b.click(); return Boolean(b); })()`,
    );
    await sleep(400);
    await shot(win, `33-delta-hidden-row-${tag}`);

    await win.webContents.executeJavaScript(
      `(() => { const input = document.querySelector('.sw-search input'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(input, 'coil'); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
    );
    await sleep(600);
    await shot(win, `34-delta-search-${tag}`);

    // Real Tab presses, so :focus-visible rings actually render in the capture.
    await win.webContents.executeJavaScript(
      `(() => { const input = document.querySelector('.sw-search input'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); return true; })()`,
    );
    await sleep(500);
    for (let i = 0; i < 3; i += 1) {
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
      await sleep(150);
    }
    await sleep(300);
    await shot(win, `36-keyboard-focus-${tag}`);

    // Scanner without a CAD assembly: the browser must explain itself, not look broken.
    await win.webContents.executeJavaScript(
      `document.getElementById('sw-tab-general').click(); true`,
    );
    await sleep(400);
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.sw-family-card')].find((b) => b.textContent.includes('Zeugmatron')).click(); true`,
    );
    await sleep(500);
    await win.webContents.executeJavaScript(
      `document.getElementById('sw-tab-components').click(); true`,
    );
    await sleep(600);
    await shot(win, `35-no-cad-components-${tag}`);

    // Restore the Halbach default so a later manual run starts where the user left off.
    await win.webContents.executeJavaScript(
      `document.getElementById('sw-tab-general').click(); true`,
    );
    await sleep(300);
    await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.sw-family-card')].find((b) => b.textContent.includes('Halbach')).click(); true`,
    );
    await sleep(400);

    win.destroy();
  }

  server.close();
  app.quit();
}

app.whenReady().then(() =>
  run().catch((err) => {
    console.error(err);
    app.exit(1);
  }),
);
