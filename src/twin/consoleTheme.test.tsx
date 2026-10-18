import { act, fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyConsoleTheme, readConsoleTheme, setConsoleTheme, useConsoleTheme, LIGHT_THEME_PALETTES } from "./consoleTheme";
import { readViewportBg, setViewportBg, resetViewportBg, useViewportBg } from "./viewportBg";
import { ConsoleThemeRow } from "./settings/controls";
import { scientificPlotColors, PLOT_BG, PLOT_SIGNAL, buildScientificPlotOption } from "./scientificPlotTheme";

beforeEach(() => { localStorage.clear(); applyConsoleTheme("adelpha"); });
afterEach(() => { cleanup(); localStorage.clear(); applyConsoleTheme("adelpha"); });

function ThemeObserver() {
  const [theme] = useConsoleTheme();
  const [background] = useViewportBg();
  return <output data-testid="appearance">{theme}:{background}</output>;
}

describe("application themes", () => {
  it("keeps existing preferences and falls back safely for an unknown value", () => {
    expect(readConsoleTheme()).toBe("adelpha");
    localStorage.setItem("adelpha.consoleTheme", "mri4all");
    expect(readConsoleTheme()).toBe("mri4all");
    localStorage.setItem("adelpha.consoleTheme", "future-theme");
    expect(readConsoleTheme()).toBe("adelpha");
  });

  it("selects either light theme through settings, persists it, and updates mounted consumers", () => {
    render(<><ConsoleThemeRow /><ThemeObserver /></>);
    fireEvent.click(screen.getByRole("button", { name: /Porcelain/ }));
    expect(readConsoleTheme()).toBe("porcelain");
    expect(screen.getByRole("button", { name: /Porcelain/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("appearance")).toHaveTextContent("porcelain:#b7bec9");
    fireEvent.click(screen.getByRole("button", { name: /Glacier/ }));
    expect(readConsoleTheme()).toBe("glacier");
    expect(screen.getByTestId("appearance")).toHaveTextContent("glacier:#b7bec9");
    expect(document.documentElement.style.getPropertyValue("--theme-accent")).toBe("#086b8a");
  });

  it.each(["adelpha", "mri4all"] as const)("restores every dark fallback when switching back to %s", (theme) => {
    setConsoleTheme("glacier");
    setConsoleTheme(theme);
    expect(document.documentElement.dataset.consoleTheme).toBe(theme);
    for (const token of Object.keys(LIGHT_THEME_PALETTES.porcelain)) {
      expect(document.documentElement.style.getPropertyValue(`--theme-${token}`)).toBe("");
    }
    expect(readViewportBg()).toBe("#030303");
    expect(scientificPlotColors(theme).bg).toBe(PLOT_BG);
    expect(scientificPlotColors(theme).signal).toBe(PLOT_SIGNAL);
  });

  it("uses Fog in light themes while retaining the original dark viewport preference", () => {
    setViewportBg("#abc");
    render(<ThemeObserver />);
    act(() => setConsoleTheme("porcelain"));
    expect(screen.getByTestId("appearance")).toHaveTextContent("porcelain:#b7bec9");
    act(() => setConsoleTheme("glacier"));
    expect(readViewportBg()).toBe("#b7bec9");
    act(() => setConsoleTheme("adelpha"));
    expect(readViewportBg()).toBe("#aabbcc");
    act(() => setConsoleTheme("glacier"));
    act(() => setViewportBg("#ddeeff"));
    expect(readViewportBg()).toBe("#ddeeff");
    act(() => resetViewportBg());
    expect(screen.getByTestId("appearance")).toHaveTextContent("glacier:#b7bec9");
  });

  it("can apply a light theme even when storage is blocked", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => setConsoleTheme("porcelain")).not.toThrow();
    expect(document.documentElement.style.getPropertyValue("--theme-color-scheme")).toBe("light");
    render(<ThemeObserver />);
    expect(screen.getByTestId("appearance")).toHaveTextContent("porcelain:#b7bec9");
    spy.mockRestore();
  });

  it("uses light chart colors without changing the plotted measurements", () => {
    const axes = [{ title: "Signal", xlabel: "Time", ylabel: "V", xmin: 0, xmax: 1, ymin: 0, ymax: 1, series: [{ name: "Signal", x: [0, 1], y: [0.2, 0.8] }] }];
    const option = buildScientificPlotOption(axes, false, false, false, "glacier");
    expect(option.backgroundColor).toBe(LIGHT_THEME_PALETTES.glacier.surface);
    expect(option.series).toEqual(expect.arrayContaining([expect.objectContaining({ data: [[0, 0.2], [1, 0.8]], lineStyle: expect.objectContaining({ color: "#086b8a" }) })]));
  });
});
