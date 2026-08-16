/**
 * Preload bridge for the embedded shell (xterm ↔ node-pty).
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("adelphaTerminal", {
  available: true,
  start: (cols, rows) => ipcRenderer.invoke("terminal:start", { cols, rows }),
  write: (data) => {
    ipcRenderer.send("terminal:write", data);
  },
  resize: (cols, rows) => {
    ipcRenderer.send("terminal:resize", { cols, rows });
  },
  dispose: () => {
    ipcRenderer.send("terminal:dispose");
  },
  onData: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("terminal:data", handler);
    return () => ipcRenderer.removeListener("terminal:data", handler);
  },
  onExit: (cb) => {
    const handler = (_event, code) => cb(code);
    ipcRenderer.on("terminal:exit", handler);
    return () => ipcRenderer.removeListener("terminal:exit", handler);
  },
});
