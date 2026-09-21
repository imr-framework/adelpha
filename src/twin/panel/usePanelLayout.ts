import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import {
  clampPanelWidth,
  PANEL_CHAT_MIN_WIDTH,
  PANEL_COLLAPSED_KEY,
  PANEL_DEFAULT_WIDTH,
  PANEL_MODE_KEY,
  PANEL_WIDTH_KEY,
  readPanelCollapsed,
  readPanelMode,
  readPanelWidth,
  type PanelMode,
} from "./panelPrefs";

/**
 * Width, collapse and mode for the side panel, plus the pointer handlers that
 * drive its drag edge. Widths are clamped against the <main> element rather
 * than the window so the twin viewport keeps a usable share of the shell.
 */
export function usePanelLayout({
  mainRef,
  rememberPanel,
}: {
  mainRef: RefObject<HTMLElement | null>;
  rememberPanel: boolean;
}) {
  const [panelWidth, setPanelWidth] = useState(readPanelWidth);
  const [panelCollapsed, setPanelCollapsed] = useState(readPanelCollapsed);
  const [panelResizing, setPanelResizing] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>(readPanelMode);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    if (rememberPanel) return;
    setPanelWidth(PANEL_DEFAULT_WIDTH);
  }, [rememberPanel]);

  useEffect(() => {
    if (!rememberPanel) return;
    try {
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
    } catch {
      /* ignore */
    }
  }, [panelWidth, rememberPanel]);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_COLLAPSED_KEY, panelCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [panelCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_MODE_KEY, panelMode);
    } catch {
      /* ignore */
    }
  }, [panelMode]);

  const switchPanelMode = useCallback((mode: PanelMode) => {
    setPanelMode(mode);
    if (mode === "agents") {
      setPanelCollapsed(false);
      setPanelWidth((w) => Math.max(w, PANEL_CHAT_MIN_WIDTH));
    }
  }, []);

  useEffect(() => {
    const onWinResize = () => {
      const mainW = mainRef.current?.clientWidth ?? window.innerWidth;
      setPanelWidth((w) => clampPanelWidth(w, mainW));
    };
    window.addEventListener("resize", onWinResize);
    return () => window.removeEventListener("resize", onWinResize);
  }, [mainRef]);

  const onResizePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizeStart.current = { x: e.clientX, width: panelWidth };
    setPanelResizing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [panelWidth]);

  const onResizePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return;
    const mainW = mainRef.current?.clientWidth ?? window.innerWidth;
    const delta = resizeStart.current.x - e.clientX;
    setPanelWidth(clampPanelWidth(resizeStart.current.width + delta, mainW));
  }, [mainRef]);

  const onResizePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return;
    resizeStart.current = null;
    setPanelResizing(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onResizeDoubleClick = useCallback(() => {
    const mainW = mainRef.current?.clientWidth ?? window.innerWidth;
    setPanelWidth(clampPanelWidth(PANEL_DEFAULT_WIDTH, mainW));
  }, [mainRef]);

  return {
    panelWidth,
    panelCollapsed,
    panelResizing,
    panelMode,
    setPanelCollapsed,
    switchPanelMode,
    onResizePointerDown,
    onResizePointerMove,
    onResizePointerUp,
    onResizeDoubleClick,
  };
}
