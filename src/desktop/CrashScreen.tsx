import { useState } from "react";
import { clearAllImportedModels } from "../twin/importedModels";
import { quitApp } from "./runtime";
import "../styles.css";

export function CrashScreen({ error }: { error: Error }) {
  const [busy, setBusy] = useState(false);
  return (
    <div
      role="alertdialog"
      aria-labelledby="app-crash-title"
      style={{
        minHeight: "100vh",
        background: "#050505",
        color: "#e8e8e8",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "Geist Variable, system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 560 }}>
        <h1 id="app-crash-title" style={{ fontSize: 22, marginBottom: 12 }}>
          Adelpha hit a problem loading the interface
        </h1>
        <p style={{ opacity: 0.85, lineHeight: 1.5 }}>
          A saved CAD import can do this. Clearing imported models restores the bundled
          scanners and does not affect your DTAM or console config.
        </p>
        <p style={{ opacity: 0.55, fontSize: 13, marginTop: 12, wordBreak: "break-word" }}>
          {error.message}
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void clearAllImportedModels().finally(() => window.location.reload());
            }}
          >
            Clear imported models and reload
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button type="button" onClick={() => void quitApp()}>
            Quit
          </button>
        </div>
      </div>
    </div>
  );
}
