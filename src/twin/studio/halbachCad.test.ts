import { describe, expect, it } from "vitest";

import { halbachStl, halbachStlName } from "./halbachCad";
import { mri1Geometry } from "./mri1Geometry";

describe("halbachStl", () => {
  it("writes a binary assembly solid in millimetres", () => {
    const bytes = halbachStl({
      cubes: [{ x: 0.08, y: 0, z: 0, angle: 0, size: 0.012 }],
      plates: [
        {
          index: 0,
          z: 0,
          inner_radius: 0.06,
          outer_radius: 0.12,
          height: 0.012,
          stand_width: 0.1,
          stand_height: 0.14,
        },
      ],
      rods: [{ x: 0.11, y: 0, radius: 0.0025, z0: -0.006, z1: 0.006 }],
    });
    expect(new TextDecoder().decode(bytes.slice(0, 21))).toBe("Adelpha Halbach array");
    const count = new DataView(bytes.buffer).getUint32(80, true);
    expect(count).toBeGreaterThan(20);
    expect(bytes.byteLength).toBe(84 + count * 50);
  });

  it("names slice and assembly files", () => {
    expect(halbachStlName("assembly")).toBe("halbach-assembly.stl");
    expect(halbachStlName("ring", 3)).toBe("halbach-slice-03.stl");
  });
});

describe("mri1Geometry", () => {
  it("matches the O'Reilly 27 cm catalog", () => {
    const geometry = mri1Geometry();
    expect(geometry.rings).toHaveLength(26);
    expect(geometry.rings[0]).toEqual({ id: 0, radius: 148, numMagnets: 50 });
    expect(geometry.rings[3]).toEqual({ id: 3, radius: 156, numMagnets: 53 });
    expect(geometry.rings[25]).toEqual({ id: 25, radius: 221, numMagnets: 75 });
    expect(geometry.slices).toHaveLength(11);
    expect(geometry.slices[0].rings).toEqual([0, 7]);
    expect(geometry.mirrorSlices).toBe(true);
    expect(geometry.numConnectionRods).toBe(12);
  });
});
