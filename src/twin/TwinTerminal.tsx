import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useConsoleStore, type ConsoleLevel } from "./consoleLog";
import { refreshSensorsBatch, useTwinStore } from "./telemetryStore";

const PROMPT = "\x1b[90m$\x1b[0m ";

function formatClock(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function levelAnsi(level: ConsoleLevel): string {
  switch (level) {
    case "SUCCESS":
      return "\x1b[32m";
    case "WARN":
      return "\x1b[33m";
    case "ERROR":
      return "\x1b[31m";
    case "CMD":
      return "\x1b[37m";
    default:
      return "\x1b[36m";
  }
}

function writeLine(term: Terminal, level: ConsoleLevel, message: string) {
  const ts = formatClock(Date.now());
  term.writeln(
    `\x1b[90m[${ts}]\x1b[0m ${levelAnsi(level)}${level}:\x1b[0m ${message}`,
  );
}

function getShellBridge() {
  return typeof window !== "undefined" ? window.adelphaTerminal : undefined;
}

async function runBuiltinCommand(term: Terminal, raw: string) {
  const line = raw.trim();
  if (!line) return;

  const emit = (level: ConsoleLevel, message: string) => {
    writeLine(term, level, message);
  };

  const [cmd, ...args] = line.split(/\s+/);
  const name = cmd.toLowerCase();
  const store = useTwinStore.getState();

  switch (name) {
    case "help":
      emit(
        "INFO",
        "Built-in (browser): help · clear · status · sensors · hide · forecast-hint",
      );
      emit(
        "INFO",
        "For a real shell (bash/zsh), run the desktop app: npm run tauri:dev",
      );
      break;
    case "clear":
      term.clear();
      break;
    case "hide":
      useConsoleStore.getState().setOpen(false);
      emit("INFO", "Panel collapsed — expand from the header chevron");
      break;
    case "status": {
      const s = store.systemState;
      const h = store.health;
      if (!s && !h) {
        emit("WARN", "No twin state yet — is make twin-api running?");
        break;
      }
      emit(
        "INFO",
        `connection=${store.connection} scanner=${h?.scanner_id ?? s?.scanner_id ?? "—"} mode=${h?.mode ?? s?.mode ?? "—"}`,
      );
      if (s) {
        const t = s.thermal?.mean_magnet_temperature_c?.value;
        const b0 = s.magnetic?.b0_t?.value;
        const emi = s.emi?.rms_v?.value;
        const rf = s.rf?.noise_floor_dbm_per_hz?.value;
        emit(
          "SUCCESS",
          `twin=${s.twin_version} T=${t?.toFixed(3) ?? "—"}°C B0=${b0?.toExponential(4) ?? "—"}T EMI=${emi?.toExponential(3) ?? "—"}V RF=${rf?.toFixed(1) ?? "—"} dBm/Hz`,
        );
      }
      break;
    }
    case "sensors": {
      emit("INFO", "Fetching /sensors/batch …");
      const batch = await refreshSensorsBatch();
      if (!batch?.measurements?.length) {
        emit("WARN", "No measurements returned");
        break;
      }
      for (const m of batch.measurements) {
        emit(
          "INFO",
          `${m.sensor_id} ${m.quantity}=${m.value.toPrecision(5)} ${m.unit}`,
        );
      }
      emit("SUCCESS", `Batch complete (${batch.measurements.length} channels)`);
      break;
    }
    case "forecast-hint":
      emit(
        "INFO",
        "Use the Forecast card to POST /twin/forecast — predicted fields appear with predicted badges",
      );
      break;
    case "echo":
      emit("INFO", args.join(" ") || "(empty)");
      break;
    default:
      emit("WARN", `Unknown command "${cmd}" — type help`);
  }
}

const TERM_THEME = {
  background: "#000000",
  foreground: "#e8eaed",
  cursor: "#e8eaed",
  cursorAccent: "#000000",
  selectionBackground: "rgba(110, 182, 255, 0.35)",
  black: "#000000",
  red: "#ff6b6b",
  green: "#3ee4a4",
  yellow: "#e6b35a",
  blue: "#6eb6ff",
  magenta: "#c792ea",
  cyan: "#6eb6ff",
  white: "#e8eaed",
  brightBlack: "#6b7280",
  brightRed: "#ff8a98",
  brightGreen: "#6aefc0",
  brightYellow: "#f0c675",
  brightBlue: "#8ec8ff",
  brightMagenta: "#d4a5f5",
  brightCyan: "#8ec8ff",
  brightWhite: "#ffffff",
} as const;

type TwinTerminalProps = {
  active: boolean;
};

export function TwinTerminal({ active }: TwinTerminalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const lineRef = useRef("");
  const historyRef = useRef<string[]>([]);
  const histIdxRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const bridge = getShellBridge();
    const usePty = Boolean(bridge?.available);

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: 12,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      lineHeight: 1.35,
      scrollback: 5000,
      convertEol: true,
      theme: TERM_THEME,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    termRef.current = term;
    fitRef.current = fit;

    const disposables: Array<{ dispose: () => void }> = [];
    let unsubData: (() => void) | undefined;
    let unsubExit: (() => void) | undefined;
    let disposed = false;
    let lastPtyCols = 0;
    let lastPtyRows = 0;

    const hostHasSize = () => {
      const rect = host.getBoundingClientRect();
      return rect.width >= 24 && rect.height >= 24;
    };

    const fitNow = () => {
      if (!hostHasSize()) return;
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    };

    /** PTY resize makes fancy zsh themes reprint a prompt — only when size changes. */
    const syncPtySize = (cols = term.cols, rows = term.rows) => {
      if (!usePty || !bridge) return;
      if (cols < 2 || rows < 2) return;
      if (cols === lastPtyCols && rows === lastPtyRows) return;
      lastPtyCols = cols;
      lastPtyRows = rows;
      bridge.resize(cols, rows);
    };

    const ro = new ResizeObserver(() => {
      fitNow();
    });
    ro.observe(host);

    requestAnimationFrame(fitNow);

    if (usePty && bridge) {
      unsubData = bridge.onData((data) => {
        if (!disposed) term.write(data);
      });
      unsubExit = bridge.onExit((code) => {
        if (disposed) return;
        writeLine(term, "WARN", `Shell exited (${code}). Restarting…`);
        lastPtyCols = 0;
        lastPtyRows = 0;
        void bridge.start(term.cols, term.rows).then((res) => {
          if (!res.ok) {
            writeLine(term, "ERROR", res.error ?? "Failed to restart shell");
            return;
          }
          lastPtyCols = term.cols;
          lastPtyRows = term.rows;
        });
      });

      disposables.push(
        term.onData((data) => {
          bridge.write(data);
        }),
        term.onResize(({ cols, rows }) => {
          syncPtySize(cols, rows);
        }),
      );

      void (async () => {
        fitNow();
        const res = await bridge.start(term.cols, term.rows);
        if (disposed) return;
        if (!res.ok) {
          writeLine(term, "ERROR", res.error ?? "Failed to start shell");
          writeLine(term, "INFO", "Falling back to built-in twin commands");
          return;
        }
        lastPtyCols = term.cols;
        lastPtyRows = term.rows;
      })();
    } else {
      const writePrompt = () => {
        term.write(PROMPT);
      };

      writeLine(
        term,
        "INFO",
        "Browser mode — built-in twin commands only (type help)",
      );
      writeLine(
        term,
        "INFO",
        "Real bash/zsh needs the desktop app (npm run electron:dev)",
      );
      writePrompt();

      const redrawLine = () => {
        term.write("\r\x1b[K");
        term.write(PROMPT);
        term.write(lineRef.current);
      };

      disposables.push(
        term.onData((data) => {
          if (busyRef.current) return;

          if (data === "\r") {
            const value = lineRef.current;
            term.write("\r\n");
            lineRef.current = "";
            histIdxRef.current = null;
            if (value.trim()) {
              historyRef.current = [
                ...historyRef.current.slice(-49),
                value.trim(),
              ];
            }
            busyRef.current = true;
            void (async () => {
              try {
                await runBuiltinCommand(term, value);
              } finally {
                busyRef.current = false;
                writePrompt();
              }
            })();
            return;
          }

          if (data === "\u007f" || data === "\b") {
            if (!lineRef.current) return;
            lineRef.current = lineRef.current.slice(0, -1);
            redrawLine();
            return;
          }

          if (data === "\u0003") {
            term.write("^C\r\n");
            lineRef.current = "";
            histIdxRef.current = null;
            writePrompt();
            return;
          }

          if (data === "\u000c") {
            term.clear();
            writePrompt();
            term.write(lineRef.current);
            return;
          }

          if (data === "\x1b[A") {
            const hist = historyRef.current;
            if (!hist.length) return;
            const next =
              histIdxRef.current == null
                ? hist.length - 1
                : Math.max(0, histIdxRef.current - 1);
            histIdxRef.current = next;
            lineRef.current = hist[next] ?? "";
            redrawLine();
            return;
          }

          if (data === "\x1b[B") {
            const hist = historyRef.current;
            if (histIdxRef.current == null) return;
            const next = histIdxRef.current + 1;
            if (next >= hist.length) {
              histIdxRef.current = null;
              lineRef.current = "";
            } else {
              histIdxRef.current = next;
              lineRef.current = hist[next] ?? "";
            }
            redrawLine();
            return;
          }

          if (data < " " || data.startsWith("\x1b")) return;

          lineRef.current += data;
          term.write(data);
        }),
      );
    }

    return () => {
      disposed = true;
      unsubData?.();
      unsubExit?.();
      if (usePty) bridge?.dispose();
      for (const d of disposables) d.dispose();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const term = termRef.current;
    // Focus only — avoid fit/resize on every tab show (zsh reprints prompts on SIGWINCH).
    requestAnimationFrame(() => {
      term?.focus();
      term?.scrollToBottom();
    });
  }, [active]);

  return (
    <div
      className="twin-xterm"
      ref={hostRef}
      aria-label="Terminal"
      role="application"
    />
  );
}
