import { useEffect, useRef, useState, lazy, Suspense } from "react";
import {
  useConsoleStore,
  type ConsoleEntry,
  type ConsoleLevel,
  type ConsoleTab,
} from "./consoleLog";
import { useTwinStore } from "./telemetryStore";

const TwinTerminal = lazy(() =>
  import("./TwinTerminal").then((m) => ({ default: m.TwinTerminal })),
);

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
  const open = useConsoleStore((s) => s.open);
  const tab = useConsoleStore((s) => s.tab);
  const setOpen = useConsoleStore((s) => s.setOpen);
  const setTab = useConsoleStore((s) => s.setTab);
  const clear = useConsoleStore((s) => s.clear);
  const connection = useTwinStore((s) => s.connection);
  const live = connection === "connected";

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [terminalMounted, setTerminalMounted] = useState(false);
  const terminalActive = open && tab === "terminal";

  if (tab === "terminal" && !terminalMounted) {
    setTerminalMounted(true);
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !open || tab !== "system") return;
    el.scrollTop = el.scrollHeight;
  }, [entries, open, tab]);

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

      {/* Keep panels mounted so the PTY is not killed / resized on every tab toggle. */}
      <div className="system-console-panels" aria-hidden={!open}>
        <div
          className={`system-console-panel${tab === "system" ? " is-active" : ""}`}
          ref={scrollerRef}
        >
          <div className="system-console-body">
            <ConsoleLines entries={entries} />
          </div>
          <div className="system-console-input-row system-console-input-row-static">
            <span className="console-ts">logging</span>
            <span className="console-msg console-output-meta">
              read-only system events · use Terminal for commands
            </span>
          </div>
        </div>
        <div
          className={`system-console-panel system-console-xterm-host${
            tab === "terminal" ? " is-active" : ""
          }`}
        >
          {terminalMounted ? (
            <Suspense fallback={null}>
              <TwinTerminal active={terminalActive} />
            </Suspense>
          ) : null}
        </div>
      </div>
    </div>
  );
}
