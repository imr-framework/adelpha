import { describe, expect, it } from "vitest";

import { setWorkspacePrefs } from "../workspacePrefs";
import {
  clampPanelWidth,
  PANEL_COLLAPSED_KEY,
  PANEL_DEFAULT_WIDTH,
  PANEL_MIN_WIDTH,
  PANEL_MODE_KEY,
  PANEL_WIDTH_KEY,
  readPanelCollapsed,
  readPanelMode,
  readPanelWidth,
} from "./panelPrefs";

describe("clampPanelWidth", () => {
  it("holds a comfortable width unchanged", () => {
    expect(clampPanelWidth(400, 1600)).toBe(400);
  });

  it("never returns less than the minimum", () => {
    expect(clampPanelWidth(10, 1600)).toBe(PANEL_MIN_WIDTH);
    expect(clampPanelWidth(-999, 1600)).toBe(PANEL_MIN_WIDTH);
  });

  it("caps at 72% of the viewport", () => {
    expect(clampPanelWidth(5000, 1000)).toBe(720);
  });

  it("lets the minimum win on a viewport too narrow for the fraction", () => {
    // 0.72 * 200 = 144, below PANEL_MIN_WIDTH, so the floor takes over.
    expect(clampPanelWidth(300, 200)).toBe(PANEL_MIN_WIDTH);
  });

  it("rounds fractional drag positions", () => {
    expect(clampPanelWidth(400.6, 1600)).toBe(401);
  });
});

describe("readPanelMode", () => {
  it("defaults to telemetry when unset", () => {
    expect(readPanelMode()).toBe("telemetry");
  });

  it("reads a stored agents mode", () => {
    localStorage.setItem(PANEL_MODE_KEY, "agents");
    expect(readPanelMode()).toBe("agents");
  });

  it("falls back to telemetry for unrecognised values", () => {
    localStorage.setItem(PANEL_MODE_KEY, "nonsense");
    expect(readPanelMode()).toBe("telemetry");
  });
});

describe("readPanelWidth", () => {
  it("defaults when nothing is stored", () => {
    expect(readPanelWidth()).toBe(PANEL_DEFAULT_WIDTH);
  });

  it("reads a stored width", () => {
    localStorage.setItem(PANEL_WIDTH_KEY, "512");
    expect(readPanelWidth()).toBe(512);
  });

  it("rejects a stored width below the minimum", () => {
    localStorage.setItem(PANEL_WIDTH_KEY, "12");
    expect(readPanelWidth()).toBe(PANEL_DEFAULT_WIDTH);
  });

  it("rejects a non-numeric stored width", () => {
    localStorage.setItem(PANEL_WIDTH_KEY, "wide");
    expect(readPanelWidth()).toBe(PANEL_DEFAULT_WIDTH);
  });

  it("ignores the stored width when rememberPanel is off", () => {
    localStorage.setItem(PANEL_WIDTH_KEY, "512");
    setWorkspacePrefs({ rememberPanel: false });
    expect(readPanelWidth()).toBe(PANEL_DEFAULT_WIDTH);
  });
});

describe("readPanelCollapsed", () => {
  it("defaults to expanded", () => {
    expect(readPanelCollapsed()).toBe(false);
  });

  it("reads a stored collapsed flag", () => {
    localStorage.setItem(PANEL_COLLAPSED_KEY, "1");
    expect(readPanelCollapsed()).toBe(true);
  });

  it("ignores the stored flag when restoreLayout is off", () => {
    localStorage.setItem(PANEL_COLLAPSED_KEY, "1");
    setWorkspacePrefs({ restoreLayout: false });
    expect(readPanelCollapsed()).toBe(false);
  });
});
