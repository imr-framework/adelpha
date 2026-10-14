import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DtamTwinSetupSection } from "./DtamSetupSection";
import { DEFAULT_DTAM_PREFS, readDtamRuntimePrefs, saveDtamRuntimePrefs } from "../../desktop/dtamRuntime";
vi.mock("../../desktop/runtime", () => ({ isTauri: () => true, getRuntime: () => ({}) }));
vi.mock("../../desktop/dtamRuntime", async (original) => ({
  ...await original<typeof import("../../desktop/dtamRuntime")>(),
  readDtamRuntimePrefs: vi.fn(), saveDtamRuntimePrefs: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(readDtamRuntimePrefs).mockResolvedValue(DEFAULT_DTAM_PREFS);
  vi.mocked(saveDtamRuntimePrefs).mockImplementation(async (prefs) => prefs);
});
it("saves and selects a custom hardware system", async () => {
  render(<DtamTwinSetupSection />);
  await waitFor(() => expect(readDtamRuntimePrefs).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Define new system" }));
  fireEvent.change(screen.getByLabelText("System name"), { target: { value: "Lab magnet" } });
  fireEvent.change(screen.getByLabelText("Nominal field strength in tesla"), { target: { value: "0.1" } });
  fireEvent.click(screen.getByRole("button", { name: "Save and use system" }));
  await waitFor(() => expect(screen.getByRole("option", { name: "Lab magnet" })).toBeInTheDocument());
  const saved = vi.mocked(saveDtamRuntimePrefs).mock.calls.at(-1)![0];
  expect(saved.custom_systems?.[0].field_strength_t).toBe(0.1);
  expect(saved.scanner_id).toBe(saved.custom_systems?.[0].id);
});
it("keeps the active selection if switching fails", async () => {
  vi.mocked(saveDtamRuntimePrefs).mockRejectedValue(new Error("Could not restart"));
  render(<DtamTwinSetupSection />);
  fireEvent.change(screen.getByRole("combobox", { name: "Scanner profile" }), { target: { value: "halbach_48mt" } });
  await screen.findByText("Could not restart");
  expect(screen.getByRole("combobox", { name: "Scanner profile" })).toHaveValue("simulated_scanner");
});
