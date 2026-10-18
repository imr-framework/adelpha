import type { CoilLayout, CoilWire } from "../mri/api";

/** Opposite-current groups, matching pyCoilGen's contour figures. */
const GROUP_COLORS = ["#6ea8ff", "#e07070", "#86d4a8", "#e2b340", "#c4b5fd"];

export function windingColor(group: number) {
  return GROUP_COLORS[Math.abs(group) % GROUP_COLORS.length];
}

/** Copy xyz triplets into one typed buffer so `.flat()` does not double peak memory. */
export function packTriplets(points: number[][]) {
  const data = new Float32Array(points.length * 3);
  let offset = 0;
  for (const point of points) {
    data[offset++] = point[0];
    data[offset++] = point[1];
    data[offset++] = point[2];
  }
  return data;
}

export function packFaces(faces: number[][]) {
  const data = new Uint32Array(faces.length * 3);
  let offset = 0;
  for (const face of faces) {
    data[offset++] = face[0];
    data[offset++] = face[1];
    data[offset++] = face[2];
  }
  return data;
}

/** Preserve each closed contour as one path. */
export function splitWirePoints(points: number[][], closed: boolean): { points: number[][]; closed: boolean }[] {
  if (points.length < 2 || points.some((p) => p.length !== 3 || p.some((v) => !Number.isFinite(v)))) return [];
  return [{ points, closed }];
}

export function coilBounds(layout: CoilLayout) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const include = (x: number, y: number, z: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  };
  for (const [x, y, z] of layout.vertices) include(x, y, z);
  for (const wire of layout.wires) {
    for (const [x, y, z] of wire.points) include(x, y, z);
  }
  if (!Number.isFinite(minX)) {
    return { center: [0, 0, 0] as const, size: 0.05, radius: 0.025 };
  }
  const pad = Math.max(layout.wire_radius ?? 0, 0);
  const dx = maxX - minX + pad * 2;
  const dy = maxY - minY + pad * 2;
  const dz = maxZ - minZ + pad * 2;
  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2] as const,
    size: Math.max(dx, dy, dz, 0.05),
    radius: Math.max(Math.hypot(dx, dy, dz) / 2, 0.025),
  };
}

export function displayWireRadius(wireRadius: number, selected = false) {
  const visual = Math.max(wireRadius * 0.55, 2.5e-4);
  return selected ? visual * 1.45 : visual;
}

export function wireKey(wire: CoilWire, index: number) {
  return `${wire.group}-${index}-${wire.points.length}`;
}

