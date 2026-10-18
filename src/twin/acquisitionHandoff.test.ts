import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyAcquisitionHandoff,
  requestUseAcquisitionParameters,
  subscribeOpenImagingConsole,
  takeAcquisitionHandoff,
} from "./acquisitionHandoff";

vi.mock("./mri/api", () => ({
  fetchCurrentExam: vi.fn(),
  startExam: vi.fn(),
  createScan: vi.fn(),
  fetchScan: vi.fn(),
  patchScan: vi.fn(),
}));

import { createScan, fetchCurrentExam, fetchScan, patchScan, startExam } from "./mri/api";

afterEach(() => {
  takeAcquisitionHandoff();
  vi.clearAllMocks();
});

describe("acquisition handoff", () => {
  it("stores the sequence and parameters and asks Adelpha to open Imaging Console", () => {
    const open = vi.fn();
    const off = subscribeOpenImagingConsole(open);
    requestUseAcquisitionParameters({
      sequence: "se_2D",
      protocol_name: " Ace_demo ",
      parameters: { TE: 5, TR: 500 },
    });
    expect(open).toHaveBeenCalled();
    expect(takeAcquisitionHandoff()).toEqual({
      sequence: "se_2D",
      protocol_name: "Ace_demo",
      parameters: { TE: 5, TR: 500 },
    });
    expect(takeAcquisitionHandoff()).toBeNull();
    off();
  });

  it("inserts the sequence into the current exam and merges parameters", async () => {
    vi.mocked(fetchCurrentExam).mockResolvedValue({ exam: { id: "e1" } } as never);
    vi.mocked(createScan).mockResolvedValue({ id: "scan-1", sequence: "se_2D" } as never);
    vi.mocked(fetchScan).mockResolvedValue({
      task: { parameters: { TE: 15, FOV: 220, NSA: 1 } },
    } as never);
    vi.mocked(patchScan).mockResolvedValue({} as never);

    const result = await applyAcquisitionHandoff({
      sequence: "se_2D",
      protocol_name: "Ace_demo",
      parameters: { TE: 5, TR: 500 },
    });

    expect(startExam).not.toHaveBeenCalled();
    expect(createScan).toHaveBeenCalledWith("se_2D", "Ace_demo");
    expect(patchScan).toHaveBeenCalledWith("scan-1", {
      protocol_name: "Ace_demo",
      parameters: { TE: 5, FOV: 220, NSA: 1, TR: 500 },
    });
    expect(result.entry.id).toBe("scan-1");
  });

  it("starts a simulation exam when none is open", async () => {
    vi.mocked(fetchCurrentExam).mockResolvedValue(null);
    vi.mocked(startExam).mockResolvedValue({ exam: { id: "new" } } as never);
    vi.mocked(createScan).mockResolvedValue({ id: "scan-2" } as never);
    vi.mocked(fetchScan).mockResolvedValue({ task: { parameters: {} } } as never);
    vi.mocked(patchScan).mockResolvedValue({} as never);

    await applyAcquisitionHandoff({
      sequence: "tse_3D",
      protocol_name: "TSE study",
      parameters: { ETL: 8 },
    });

    expect(startExam).toHaveBeenCalledWith(
      expect.objectContaining({
        acc: "MR0",
        patient: expect.objectContaining({ last_name: "Simulation", first_name: "TSE study" }),
      }),
    );
  });
});
