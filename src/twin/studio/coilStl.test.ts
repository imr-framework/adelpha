import { describe, expect, it } from "vitest";

import { windingStl, windingStlName } from "./coilStl";

describe("windingStl", () => {
  it("writes a binary tube solid in millimetres", () => {
    const bytes = windingStl({
      vertices: [],
      faces: [],
      colors: [],
      wires: [
        {
          group: 0,
          closed: true,
          points: [
            [0, 0, 0],
            [0.05, 0, 0],
            [0.05, 0.05, 0],
            [0, 0.05, 0],
          ],
        },
      ],
      wire_radius: 0.002,
      stream_min: 0,
      stream_max: 1,
    });
    expect(new TextDecoder().decode(bytes.slice(0, 30))).toBe("Adelpha gradient winding loops");
    const count = new DataView(bytes.buffer).getUint32(80, true);
    expect(count).toBeGreaterThan(10);
    expect(bytes.byteLength).toBe(84 + count * 50);
  });

  it("names the file from former and axis", () => {
    expect(windingStlName("circular", "x")).toBe("circular-x-gradient.stl");
  });
});
