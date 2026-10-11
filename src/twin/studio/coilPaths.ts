import type { CoilLayout, CoilWire } from "../mri/api";

/** Split a solver path where consecutive samples jump far beyond typical spacing. */
export function splitWirePoints(points: number[][], closed: boolean): { points: number[][]; closed: boolean }[] {
  if (points.length < 2) return [];
  const edges: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    edges.push(distance(points[index - 1], points[index]));
  }
  if (closed) edges.push(distance(points[points.length - 1], points[0]));
  const sorted = [...edges].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const limit = Math.max(median * 8, 1e-4);

  const groups: number[][][] = [];
  let current = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    if (distance(points[index - 1], points[index]) > limit) {
      if (current.length >= 2) groups.push(current);
      current = [points[index]];
    } else {
      current.push(points[index]);
    }
  }
  const closes = closed && distance(points[points.length - 1], points[0]) <= limit;
  if (closes && groups.length === 0 && current.length >= 3) {
    return [{ points: current, closed: true }];
  }
  if (current.length >= 2) groups.push(current);
  return groups.map((group) => ({ points: group, closed: false }));
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
  const visual = Math.max(wireRadius * 0.32, 1.5e-4);
  return selected ? visual * 1.7 : visual;
}

export function wireKey(wire: CoilWire, index: number) {
  return `${wire.group}-${index}-${wire.points.length}`;
}

function distance(a: number[], b: number[]) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.hypot(dx, dy, dz);
}
