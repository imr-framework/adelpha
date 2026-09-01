import { useState } from "react";
import "../styles.css";
import {
  exportDiagnostics,
  quitApp,
  restartRuntime,
  type RuntimeStatus,
} from "./runtime";
import { OverlayChrome } from "./WindowControls";

export function RecoveryScreen({ runtime }: { runtime: RuntimeStatus }) {
  const [diag, setDiag] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const message =
    runtime.error ||
    (runtime.requiredFailed.length
      ? runtime.requiredFailed
          .map((id) =>
            id === "twin"
              ? "Twin service failed to initialize"
              : id === "console"
                ? "Imaging console failed to initialize"
                : `${id} failed to initialize`,
          )
          .join(". ")
      : "The Python runtime could not start.");

  return (
    <div
      role="alertdialog"
      aria-labelledby="runtime-recovery-title"
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
      <OverlayChrome />
      <div style={{ maxWidth: 560 }}>
        <h1 id="runtime-recovery-title" style={{ fontSize: 22, marginBottom: 12 }}>
          Adelpha could not start its Python runtime
        </h1>
        <p style={{ opacity: 0.85, lineHeight: 1.5 }}>{message}</p>
        <p style={{ opacity: 0.6, fontSize: 13 }}>
          Adelpha {runtime.adelphaVersion || "0.1.0"} · Tauri {runtime.tauriVersion || "—"} ·
          Python runtime {runtime.pythonRuntimeVersion || "—"}
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void restartRuntime().then(() => window.location.reload());
            }}
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => {
              void exportDiagnostics().then(setDiag);
            }}
          >
            Export diagnostics
          </button>
          <button type="button" onClick={() => void quitApp()}>
            Quit
          </button>
        </div>
        {diag ? <p style={{ opacity: 0.7, marginTop: 16 }}>Wrote {diag}</p> : null}
      </div>
    </div>
  );
}
