import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  useConsoleStore,
  type ConsoleEntry,
  type ConsoleLevel,
  type ConsoleTab,
} from "./consoleLog";
import { refreshSensorsBatch, useTwinStore } from "./telemetryStore";

function formatClock(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function levelClass(level: ConsoleLevel) {
  switch (level) {
    case "SUCCESS":
      return "console-level-success";
    case "WARN":
      return "console-level-warn";
    case "ERROR":
      return "console-level-error";
    case "CMD":
      return "console-level-cmd";
    default:
      return "console-level-info";
  }
}

async function runCommand(raw: string) {
  const line = raw.trim();
  if (!line) return;

  const emit = (level: ConsoleLevel, message: string) => {
    useConsoleStore.getState().pushTerminal(level, message);
  };

  emit("CMD", `$ ${line}`);

  const [cmd, ...args] = line.split(/\s+/);
  const name = cmd.toLowerCase();
  const store = useTwinStore.getState();

  switch (name) {
    case "help":
      emit(
        "INFO",
        "Commands: help · clear · status · sensors · hide · forecast-hint",
      );
      break;
    case "clear":
      useConsoleStore.getState().clearTerminal();
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

function ConsoleLines({ entries }: { entries: ConsoleEntry[] }) {
  return (
    <>
      {entries.map((entry) => (
        <div key={entry.id} className="console-line">
          <span className="console-ts">[{formatClock(entry.ts)}]</span>{" "}
          <span className={levelClass(entry.level)}>{entry.level}:</span>{" "}
          <span className="console-msg">{entry.message}</span>
        </div>
      ))}
    </>
  );
}

const TABS: { id: ConsoleTab; label: string }[] = [
  { id: "system", label: "Logging" },
  { id: "terminal", label: "Terminal" },
];

export function SystemConsole() {
  const entries = useConsoleStore((s) => s.entries);
  const terminalEntries = useConsoleStore((s) => s.terminalEntries);
  const open = useConsoleStore((s) => s.open);
  const tab = useConsoleStore((s) => s.tab);
  const setOpen = useConsoleStore((s) => s.setOpen);
  const setTab = useConsoleStore((s) => s.setTab);
  const clear = useConsoleStore((s) => s.clear);
  const connection = useTwinStore((s) => s.connection);
  const live = connection === "connected";

  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const scrollDeps = tab === "system" ? entries : terminalEntries;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !open) return;
    el.scrollTop = el.scrollHeight;
  }, [scrollDeps, open, tab]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (tab !== "terminal") return;
    const value = draft;
    setDraft("");
    setHistIdx(null);
    if (value.trim()) {
      setHistory((h) => [...h.slice(-49), value.trim()]);
    }
    await runCommand(value);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const next = histIdx == null ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setDraft(history[next] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx == null) return;
      const next = histIdx + 1;
      if (next >= history.length) {
        setHistIdx(null);
        setDraft("");
      } else {
        setHistIdx(next);
        setDraft(history[next] ?? "");
      }
    }
  }

  const title = tab === "terminal" ? "Terminal" : "Logging";

  return (
    <div className={`system-console${open ? "" : " system-console-collapsed"}`}>
      <div className="system-console-head">
        <div className="system-console-head-left">
          <div className="system-console-tabs" role="tablist" aria-label="Console panels">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`system-console-tab${tab === t.id ? " system-console-tab-active" : ""}`}
                onClick={() => {
                  setTab(t.id);
                  setOpen(true);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span
            className={`console-live${live ? " console-live-on" : " console-live-off"}`}
            title={live ? "Connected" : "Disconnected"}
            aria-label={live ? "Connected" : "Disconnected"}
            role="status"
          >
            <span className="console-live-dot" aria-hidden />
          </span>
        </div>
        <div className="system-console-head-right">
          {tab === "system" ? (
            <button
              type="button"
              className="system-console-clear"
              onClick={() => clear()}
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            className="system-console-toggle"
            aria-expanded={open}
            aria-label={open ? `Hide ${title}` : `Show ${title}`}
            onClick={() => setOpen(!open)}
          >
            <span className={`console-chevron${open ? "" : " console-chevron-up"}`} aria-hidden>
              ▾
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <>
          <div className="system-console-body" ref={scrollerRef}>
            {tab === "system" ? <ConsoleLines entries={entries} /> : null}
            {tab === "terminal" ? <ConsoleLines entries={terminalEntries} /> : null}
          </div>
          {tab === "terminal" ? (
            <form className="system-console-input-row" onSubmit={(e) => void onSubmit(e)}>
              <span className="console-ts">[{formatClock(Date.now())}]</span>
              <span className="console-prompt-prefix" aria-hidden>
                $
              </span>
              <input
                ref={inputRef}
                className="system-console-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="help · clear · status · sensors"
                spellCheck={false}
                autoComplete="off"
                aria-label="Terminal command"
              />
              {!draft ? <span className="console-cursor" aria-hidden>_</span> : null}
            </form>
          ) : (
            <div className="system-console-input-row system-console-input-row-static">
              <span className="console-ts">logging</span>
              <span className="console-msg console-output-meta">
                read-only system events · use Terminal for commands
              </span>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
