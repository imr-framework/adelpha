import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";

import { requestOpenSettings } from "../settingsOpen";
import { useSettingsOverlay } from "./useSettingsOverlay";

const emptyRef = { current: null } as { current: HTMLElement | null };

describe("open and close", () => {
  it("starts closed with no launch target", () => {
    const { result } = renderHook(() => useSettingsOverlay({ mainRef: emptyRef }));
    expect(result.current.showSettings).toBe(false);
    expect(result.current.settingsLaunch).toBeNull();
  });

  it("toggles open and shut", () => {
    const { result } = renderHook(() => useSettingsOverlay({ mainRef: emptyRef }));
    act(() => result.current.toggleSettings());
    expect(result.current.showSettings).toBe(true);
    act(() => result.current.toggleSettings());
    expect(result.current.showSettings).toBe(false);
  });

  it("closes on Escape", () => {
    const { result } = renderHook(() => useSettingsOverlay({ mainRef: emptyRef }));
    act(() => result.current.toggleSettings());
    act(() => void fireEvent.keyDown(window, { key: "Escape" }));
    expect(result.current.showSettings).toBe(false);
  });

  it("ignores other keys", () => {
    const { result } = renderHook(() => useSettingsOverlay({ mainRef: emptyRef }));
    act(() => result.current.toggleSettings());
    act(() => void fireEvent.keyDown(window, { key: "Enter" }));
    expect(result.current.showSettings).toBe(true);
  });

  it("opens with a launch target when something requests it", () => {
    const { result } = renderHook(() => useSettingsOverlay({ mainRef: emptyRef }));
    act(() => requestOpenSettings({ page: "models" } as never));
    expect(result.current.showSettings).toBe(true);
    expect(result.current.settingsLaunch).toEqual({ page: "models" });
  });

  it("drops the launch target when closed", () => {
    const { result } = renderHook(() => useSettingsOverlay({ mainRef: emptyRef }));
    act(() => requestOpenSettings({ page: "models" } as never));
    act(() => result.current.closeSettings());
    expect(result.current.showSettings).toBe(false);
    expect(result.current.settingsLaunch).toBeNull();
  });
});

/**
 * The overlay is opaque, so everything else inside <main> must leave the tab
 * order while it is open. jsdom does not implement inert semantics, so this
 * guards which elements get marked and that cleanup unmarks them — not the
 * focus behaviour itself.
 */
describe("inert siblings", () => {
  function Harness() {
    const mainRef = useRef<HTMLElement | null>(null);
    const { showSettings, toggleSettings } = useSettingsOverlay({ mainRef });
    return (
      <main ref={mainRef}>
        <section data-testid="viewport" />
        <aside data-testid="panel" />
        {showSettings ? <div className="settings-overlay" data-testid="overlay" /> : null}
        <button type="button" onClick={toggleSettings}>
          toggle
        </button>
      </main>
    );
  }

  it("marks siblings inert while open and restores them on close", () => {
    const { getByText, getByTestId } = render(<Harness />);
    const viewport = getByTestId("viewport");
    const panel = getByTestId("panel");

    expect(viewport.inert).not.toBe(true);

    fireEvent.click(getByText("toggle"));
    expect(viewport.inert).toBe(true);
    expect(panel.inert).toBe(true);
    expect(getByTestId("overlay").inert).not.toBe(true);

    fireEvent.click(getByText("toggle"));
    expect(viewport.inert).toBe(false);
    expect(panel.inert).toBe(false);
  });
});
