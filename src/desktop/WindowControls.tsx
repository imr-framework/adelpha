import { useEffect, useState, type HTMLAttributes } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyDesktopChromeAttrs, subscribeDesktopChrome, usesCustomCaption } from "./chrome";
import { isTauri } from "./runtime";

export function TitleDrag(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      data-tauri-drag-region
      onDoubleClick={(event) => {
        props.onDoubleClick?.(event);
        if (event.defaultPrevented || !isTauri() || !usesCustomCaption()) return;
        void getCurrentWindow().toggleMaximize();
      }}
    />
  );
}

function CaptionIcon({ kind }: { kind: "min" | "max" | "restore" | "close" }) {
  if (kind === "min") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d="M1 5h8" fill="none" stroke="currentColor" strokeWidth="1.15" />
      </svg>
    );
  }
  if (kind === "max") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <rect x="1.2" y="1.2" width="7.6" height="7.6" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.15" />
      </svg>
    );
  }
  if (kind === "restore") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path
          d="M2.6 3.4h4v4h-4zM3.6 2.2h4.2v4.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.15"
        />
      </svg>
    );
  }
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M2 2l6 6M8 2L2 8" fill="none" stroke="currentColor" strokeWidth="1.15" />
    </svg>
  );
}

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const [caption, setCaption] = useState(() => usesCustomCaption());

  useEffect(() => {
    const sync = () => setCaption(usesCustomCaption());
    sync();
    return subscribeDesktopChrome(sync);
  }, []);

  useEffect(() => {
    if (!isTauri() || !caption) return;
    const win = getCurrentWindow();
    let cancelled = false;
    void win.isMaximized().then((value) => {
      if (!cancelled) setMaximized(value);
    });
    const unlisten = win.onResized(() => {
      void win.isMaximized().then((value) => {
        if (!cancelled) setMaximized(value);
      });
    });
    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
    };
  }, [caption]);

  if (!caption) return null;

  const win = getCurrentWindow();

  return (
    <div className="window-controls" role="group" aria-label="Window">
      <button
        type="button"
        className="window-ctrl"
        aria-label="Minimize"
        title="Minimize"
        onClick={() => void win.minimize()}
      >
        <CaptionIcon kind="min" />
      </button>
      <button
        type="button"
        className="window-ctrl"
        aria-label={maximized ? "Restore" : "Maximize"}
        title={maximized ? "Restore" : "Maximize"}
        onClick={() => void win.toggleMaximize()}
      >
        <CaptionIcon kind={maximized ? "restore" : "max"} />
      </button>
      <button
        type="button"
        className="window-ctrl window-ctrl-close"
        aria-label="Close"
        title="Close"
        onClick={() => void win.close()}
      >
        <CaptionIcon kind="close" />
      </button>
    </div>
  );
}

/** Full-width drag strip + caption buttons for launch / recovery / crash. */
export function OverlayChrome() {
  useEffect(() => {
    applyDesktopChromeAttrs();
  }, []);

  if (!isTauri()) return null;

  return (
    <div className="desktop-chrome-overlay">
      <TitleDrag className="desktop-chrome-drag" />
      <WindowControls />
    </div>
  );
}
