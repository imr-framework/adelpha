import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import {
  PANEL_CHAT_MIN_WIDTH,
  PANEL_COLLAPSED_KEY,
  PANEL_DEFAULT_WIDTH,
  PANEL_MIN_WIDTH,
  PANEL_MODE_KEY,
  PANEL_WIDTH_KEY,
} from "../panelPrefs";
import { usePanelLayout } from "./usePanelLayout";

function setup(rememberPanel = true, mainWidth = 1600) {
  const mainRef = createRef<HTMLElement>() as { current: HTMLElement | null };
  mainRef.current = { clientWidth: mainWidth } as HTMLElement;
  return renderHook(() => usePanelLayout({ mainRef, rememberPanel }));
}

describe("defaults", () => {
  it("starts expanded, in telemetry mode, at the default width", () => {
    const { result } = setup();
    expect(result.current.panelWidth).toBe(PANEL_DEFAULT_WIDTH);
    expect(result.current.panelCollapsed).toBe(false);
    expect(result.current.panelMode).toBe("telemetry");
    expect(result.current.panelResizing).toBe(false);
  });
});

describe("persistence", () => {
  it("writes the collapsed flag", () => {
    const { result } = setup();
    act(() => result.current.setPanelCollapsed(true));
    expect(localStorage.getItem(PANEL_COLLAPSED_KEY)).toBe("1");
    act(() => result.current.setPanelCollapsed(false));
    expect(localStorage.getItem(PANEL_COLLAPSED_KEY)).toBe("0");
  });

  it("writes the panel mode", () => {
    const { result } = setup();
    act(() => result.current.switchPanelMode("agents"));
    expect(localStorage.getItem(PANEL_MODE_KEY)).toBe("agents");
  });

  it("writes the width when rememberPanel is on", () => {
    setup(true);
    expect(localStorage.getItem(PANEL_WIDTH_KEY)).toBe(String(PANEL_DEFAULT_WIDTH));
  });

  it("does not write the width when rememberPanel is off", () => {
    setup(false);
    expect(localStorage.getItem(PANEL_WIDTH_KEY)).toBeNull();
  });
});

describe("switchPanelMode", () => {
  it("expands the panel and widens it to the chat minimum for agents", () => {
    const { result } = setup();
    act(() => result.current.setPanelCollapsed(true));
    act(() => result.current.switchPanelMode("agents"));
    expect(result.current.panelMode).toBe("agents");
    expect(result.current.panelCollapsed).toBe(false);
    expect(result.current.panelWidth).toBeGreaterThanOrEqual(PANEL_CHAT_MIN_WIDTH);
  });

  it("leaves width and collapse alone when returning to telemetry", () => {
    const { result } = setup();
    act(() => result.current.switchPanelMode("agents"));
    const width = result.current.panelWidth;
    act(() => result.current.setPanelCollapsed(true));
    act(() => result.current.switchPanelMode("telemetry"));
    expect(result.current.panelMode).toBe("telemetry");
    expect(result.current.panelCollapsed).toBe(true);
    expect(result.current.panelWidth).toBe(width);
  });
});

describe("drag resize", () => {
  const pointer = (clientX: number) =>
    ({
      clientX,
      pointerId: 1,
      preventDefault() {},
      currentTarget: { setPointerCapture() {}, releasePointerCapture() {} },
    }) as never;

  it("widens the panel when dragged left and flags resizing", () => {
    const { result } = setup();
    act(() => result.current.onResizePointerDown(pointer(1000)));
    expect(result.current.panelResizing).toBe(true);
    act(() => result.current.onResizePointerMove(pointer(900)));
    expect(result.current.panelWidth).toBe(PANEL_DEFAULT_WIDTH + 100);
    act(() => result.current.onResizePointerUp(pointer(900)));
    expect(result.current.panelResizing).toBe(false);
  });

  it("ignores a move that was never preceded by a pointer down", () => {
    const { result } = setup();
    act(() => result.current.onResizePointerMove(pointer(100)));
    expect(result.current.panelWidth).toBe(PANEL_DEFAULT_WIDTH);
  });

  it("clamps a drag past the viewport fraction", () => {
    const { result } = setup(true, 1000);
    act(() => result.current.onResizePointerDown(pointer(1000)));
    act(() => result.current.onResizePointerMove(pointer(-5000)));
    expect(result.current.panelWidth).toBe(720);
  });

  it("clamps a drag below the minimum", () => {
    const { result } = setup();
    act(() => result.current.onResizePointerDown(pointer(0)));
    act(() => result.current.onResizePointerMove(pointer(5000)));
    expect(result.current.panelWidth).toBe(PANEL_MIN_WIDTH);
  });

  it("resets to the default width on double click", () => {
    const { result } = setup();
    act(() => result.current.onResizePointerDown(pointer(1000)));
    act(() => result.current.onResizePointerMove(pointer(800)));
    expect(result.current.panelWidth).not.toBe(PANEL_DEFAULT_WIDTH);
    act(() => result.current.onResizeDoubleClick());
    expect(result.current.panelWidth).toBe(PANEL_DEFAULT_WIDTH);
  });
});
