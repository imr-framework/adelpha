/** Closed conductor loops: fill isoline gaps and build a pinch-free tube. */

function subtract(a: number[], b: number[]) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a: number[], b: number[]) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(a: number[], s: number) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function cross(a: number[], b: number[]) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: number[], b: number[]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(a: number[]) {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize(a: number[]) {
  const mag = length(a);
  return mag > 1e-15 ? scale(a, 1 / mag) : [1, 0, 0];
}

function catmull(p0: number[], p1: number[], p2: number[], p3: number[], t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1, 2].map(
    (axis) =>
      0.5 *
      (2 * p1[axis] +
        (-p0[axis] + p2[axis]) * t +
        (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 +
        (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3),
  );
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function loopNormal(points: number[][]) {
  let normal = [0, 0, 0];
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    normal = add(normal, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
  }
  return normalize(normal);
}

function nearlyPlanar(points: number[][]) {
  const center = [0, 1, 2].map((axis) => points.reduce((sum, point) => sum + point[axis], 0) / points.length);
  const normal = loopNormal(points);
  const radius = Math.max(...points.map((point) => length(subtract(point, center))), 1e-6);
  return points.every((point) => Math.abs(dot(subtract(point, center), normal)) < 0.08 * radius);
}

function stripDuplicate(points: number[][]) {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (length(subtract(first, last)) < 1e-9) return points.slice(0, -1);
  return points;
}

function rotateAround(axis: number[], vector: number[], angle: number) {
  const k = normalize(axis);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return add(add(scale(vector, cos), scale(cross(k, vector), sin)), scale(k, dot(k, vector) * (1 - cos)));
}

/** Snap a closed isoline shut, filling a coplanar gap so the wire is one loop. */
export function closedConductorPoints(points: number[][], closed: boolean): number[][] {
  const ring = stripDuplicate(points.filter((point) => point.length === 3 && point.every((value) => Number.isFinite(value))));
  if (!closed || ring.length < 3) return ring;
  const gap = length(subtract(ring[0], ring[ring.length - 1]));
  const edges = ring.slice(0, -1).map((_, index) => length(subtract(ring[index + 1], ring[index])));
  const typical = median(edges);
  const perimeter = edges.reduce((sum, edge) => sum + edge, 0) + gap;
  if (gap <= typical * 1.25 || gap > 0.55 * perimeter || !nearlyPlanar(ring)) return ring;
  const steps = Math.max(4, Math.min(24, Math.round(gap / Math.max(typical, 1e-6))));
  const extra: number[][] = [];
  const p0 = ring[ring.length - 2];
  const p1 = ring[ring.length - 1];
  const p2 = ring[0];
  const p3 = ring[1];
  for (let index = 1; index < steps; index += 1) extra.push(catmull(p0, p1, p2, p3, index / steps));
  return [...ring, ...extra];
}

function closedFrames(points: number[][]) {
  const count = points.length;
  const tangents = points.map((_, index) =>
    normalize(subtract(points[(index + 1) % count], points[(index - 1 + count) % count])),
  );
  const normals: number[][] = [];
  let normal = normalize(cross(tangents[0], Math.abs(tangents[0][2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  for (let index = 0; index < count; index += 1) {
    const binormal = normalize(cross(tangents[index], normal));
    normal = normalize(cross(binormal, tangents[index]));
    normals.push(normal);
  }
  const predicted = normalize(cross(normalize(cross(tangents[0], normals[count - 1])), tangents[0]));
  const twist = Math.atan2(dot(cross(predicted, normals[0]), tangents[0]), dot(predicted, normals[0]));
  return tangents.map((tangent, index) => {
    const corrected = rotateAround(tangent, normals[index], (index / count) * twist);
    return { tangent, normal: corrected, binormal: normalize(cross(tangent, corrected)) };
  });
}

function openFrames(points: number[][]) {
  const tangents = points.map((point, index) => {
    if (index === 0) return normalize(subtract(points[1], point));
    if (index === points.length - 1) return normalize(subtract(point, points[index - 1]));
    return normalize(subtract(points[index + 1], points[index - 1]));
  });
  const frames = [];
  let normal = normalize(cross(tangents[0], Math.abs(tangents[0][2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  for (let index = 0; index < points.length; index += 1) {
    const binormal = normalize(cross(tangents[index], normal));
    normal = normalize(cross(binormal, tangents[index]));
    frames.push({ tangent: tangents[index], normal, binormal });
  }
  return frames;
}

/** Drop specks that are smaller than a fabricable turn. */
export function fabricableLoop(points: number[][], minExtent = 0.01) {
  if (points.length < 3) return false;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const [x, y, z] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return Math.max(maxX - minX, maxY - minY, maxZ - minZ) >= minExtent;
}

export function wireTubeMesh(points: number[][], radius: number, closed: boolean, sides = 8) {
  const loop = closedConductorPoints(points, closed);
  if (loop.length < (closed ? 3 : 2) || radius <= 0) return null;
  const frames = closed ? closedFrames(loop) : openFrames(loop);
  const positions: number[] = [];
  const normals: number[] = [];
  for (let index = 0; index < loop.length; index += 1) {
    const point = loop[index];
    const { normal, binormal } = frames[index];
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const radial = add(scale(normal, Math.cos(angle)), scale(binormal, Math.sin(angle)));
      positions.push(point[0] + radial[0] * radius, point[1] + radial[1] * radius, point[2] + radial[2] * radius);
      normals.push(radial[0], radial[1], radial[2]);
    }
  }
  const indices: number[] = [];
  const rings = closed ? loop.length : loop.length - 1;
  for (let index = 0; index < rings; index += 1) {
    const next = closed ? (index + 1) % loop.length : index + 1;
    for (let side = 0; side < sides; side += 1) {
      const other = (side + 1) % sides;
      const a = index * sides + side;
      const b = index * sides + other;
      const c = next * sides + side;
      const d = next * sides + other;
      indices.push(a, b, c, b, d, c);
    }
  }
  return { positions, normals, indices };
}
