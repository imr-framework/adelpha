import type { HalbachCube, HalbachPlate, HalbachRod } from "../mri/api";

function subtract(a: number[], b: number[]) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: number[], b: number[]) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function length(a: number[]) {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize(a: number[]) {
  const mag = length(a);
  return mag > 1e-15 ? [a[0] / mag, a[1] / mag, a[2] / mag] : [0, 0, 1];
}

function pack(triangles: number[][][], header: string) {
  const bytes = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(bytes);
  for (let index = 0; index < Math.min(header.length, 80); index += 1) view.setUint8(index, header.charCodeAt(index));
  view.setUint32(80, triangles.length, true);
  let offset = 84;
  for (const [a, b, c] of triangles) {
    const n = normalize(cross(subtract(b, a), subtract(c, a)));
    for (const value of [...n, ...a, ...b, ...c]) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return new Uint8Array(bytes);
}

function prism(xy: number[][], z0: number, z1: number) {
  const triangles: number[][][] = [];
  const top = xy.map(([x, y]) => [x, y, z1]);
  const bottom = xy.map(([x, y]) => [x, y, z0]);
  for (let index = 1; index < xy.length - 1; index += 1) {
    triangles.push([top[0], top[index], top[index + 1]]);
    triangles.push([bottom[0], bottom[index + 1], bottom[index]]);
  }
  for (let index = 0; index < xy.length; index += 1) {
    const next = (index + 1) % xy.length;
    triangles.push([bottom[index], bottom[next], top[next]]);
    triangles.push([bottom[index], top[next], top[index]]);
  }
  return triangles;
}

function annulus(inner: number, outer: number, z0: number, z1: number, segments = 48) {
  const triangles: number[][][] = [];
  for (let index = 0; index < segments; index += 1) {
    const a0 = (index / segments) * Math.PI * 2;
    const a1 = ((index + 1) / segments) * Math.PI * 2;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);
    const i00 = [c0 * inner, s0 * inner, z0];
    const i01 = [c0 * inner, s0 * inner, z1];
    const i10 = [c1 * inner, s1 * inner, z0];
    const i11 = [c1 * inner, s1 * inner, z1];
    const o00 = [c0 * outer, s0 * outer, z0];
    const o01 = [c0 * outer, s0 * outer, z1];
    const o10 = [c1 * outer, s1 * outer, z0];
    const o11 = [c1 * outer, s1 * outer, z1];
    triangles.push([o00, o10, o11], [o00, o11, o01], [i10, i00, i01], [i10, i01, i11], [o01, o11, i11], [o01, i11, i01], [o00, i00, i10], [o00, i10, o10]);
  }
  return triangles;
}

function box(x: number, y: number, z: number, size: number, angle: number) {
  const half = size / 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const corners: number[][] = [];
  for (const sx of [-half, half]) {
    for (const sy of [-half, half]) {
      for (const sz of [-half, half]) {
        corners.push([x + cosine * sx - sine * sy, y + sine * sx + cosine * sy, z + sz]);
      }
    }
  }
  const faces: Array<[number, number, number, number]> = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
  ];
  const triangles: number[][][] = [];
  for (const [a, b, c, d] of faces) {
    triangles.push([corners[a], corners[b], corners[c]], [corners[a], corners[c], corners[d]]);
  }
  return triangles;
}

function stand(plate: HalbachPlate) {
  const width = plate.stand_width * 1000;
  const height = plate.stand_height * 1000;
  if (width <= 0 || height <= 0) return [];
  const outer = plate.outer_radius * 1000;
  const z = plate.z * 1000;
  const half = plate.height * 500;
  return prism(
    [
      [-width / 2, -height],
      [width / 2, -height],
      [outer, 0],
      [-outer, 0],
    ],
    z - half,
    z + half,
  );
}

function cylinder(x: number, y: number, z0: number, z1: number, radius: number, segments = 16) {
  const xy = Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius];
  });
  return prism(xy, z0, z1);
}

export function halbachStl(input: {
  cubes: HalbachCube[];
  plates: HalbachPlate[];
  rods: HalbachRod[];
  sliceIndex?: number | null;
}) {
  const plates = input.sliceIndex == null ? input.plates : [input.plates[input.sliceIndex]].filter(Boolean);
  if (!plates.length) throw new Error("Generate an array before exporting CAD.");
  const plateZ = new Set(plates.map((plate) => Math.round(plate.z * 1e6) / 1e6));
  const triangles: number[][][] = [];
  for (const plate of plates) {
    const inner = plate.inner_radius * 1000;
    const outer = plate.outer_radius * 1000;
    const z = plate.z * 1000;
    const half = plate.height * 500;
    triangles.push(...annulus(inner, outer, z - half, z + half), ...stand(plate));
  }
  for (const cube of input.cubes) {
    if (!plateZ.has(Math.round(cube.z * 1e6) / 1e6)) continue;
    triangles.push(...box(cube.x * 1000, cube.y * 1000, cube.z * 1000, cube.size * 1000, cube.angle));
  }
  if (input.sliceIndex == null) {
    for (const rod of input.rods) {
      triangles.push(...cylinder(rod.x * 1000, rod.y * 1000, rod.z0 * 1000, rod.z1 * 1000, rod.radius * 1000));
    }
  }
  if (!triangles.length) throw new Error("Nothing to export for this selection.");
  return pack(triangles, "Adelpha Halbach array");
}

export function halbachStlName(target: "assembly" | "ring", sliceIndex = 0) {
  return target === "assembly" ? "halbach-assembly.stl" : `halbach-slice-${String(sliceIndex).padStart(2, "0")}.stl`;
}
