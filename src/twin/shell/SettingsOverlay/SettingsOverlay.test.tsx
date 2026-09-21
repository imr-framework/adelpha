import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettingsOverlay } from "./SettingsOverlay";

describe("SettingsOverlay", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <SettingsOverlay showSettings={false} settingsLaunch={null} closeSettings={vi.fn()} />,
    );
    expect(container.querySelector(".settings-overlay")).toBeNull();
  });

  /**
   * useSettingsOverlay finds the elements to make inert by scanning
   * main.children for anything that is not .settings-overlay, so the overlay
   * must stay a direct child of <main> with no wrapper of its own.
   */
  it("mounts .settings-overlay as a direct child of its parent", () => {
    const { container } = render(
      <main>
        <section data-testid="viewport" />
        <SettingsOverlay showSettings settingsLaunch={null} closeSettings={vi.fn()} />
      </main>,
    );
    const main = container.querySelector("main")!;
    const classes = [...main.children].map((el) => el.className);
    expect(classes).toContain("settings-overlay");
  });
});
