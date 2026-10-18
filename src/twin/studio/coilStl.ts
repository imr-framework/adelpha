import type { CoilLayout } from "../mri/api";
import { fabricableLoop, wireTubeMesh } from "./coilTube";

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
  return mag > 1e-15 ? [a[0] / mag, a[1] / mag, a[2] / mag] : [1, 0, 0];
}

function pack(triangles: number[][][]) {
  const bytes = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(bytes);
  const header = "Adelpha gradient winding loops";
  for (let index = 0; index < header.length; index += 1) view.setUint8(index, header.charCodeAt(index));
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

function meshTriangles(points: number[][], radius: number, closed: boolean) {
  const mesh = wireTubeMesh(points, radius, closed, 10);
  if (!mesh) return [];
  const triangles: number[][][] = [];
  const { positions, indices } = mesh;
  for (let index = 0; index < indices.length; index += 3) {
    const vertex = (id: number) => [
      positions[id * 3],
      positions[id * 3 + 1],
      positions[id * 3 + 2],
    ];
    triangles.push([vertex(indices[index]), vertex(indices[index + 1]), vertex(indices[index + 2])]);
  }
  return triangles;
}

/** Closed conductor loops as a millimetre tube solid. */
export function windingStl(layout: CoilLayout) {
  const radius = Math.max(layout.wire_radius, 1e-4) * 1000;
  const triangles: number[][][] = [];
  for (const wire of layout.wires) {
    if (!fabricableLoop(wire.points)) continue;
    triangles.push(
      ...meshTriangles(
        wire.points.map((point) => point.map((axis) => axis * 1000)),
        radius,
        wire.closed,
      ),
    );
  }
  if (!triangles.length) throw new Error("Could not build an STL solid from the winding loops.");
  return pack(triangles);
}

export function windingStlName(shape: string, axis: string) {
  return `${shape}-${axis}-gradient.stl`;
}
