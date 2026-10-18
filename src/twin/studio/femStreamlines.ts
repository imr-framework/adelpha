import type { FemFields } from "../mri/api";
import { bounds } from "./femFieldGeometry";
type Vec = number[];
const sub = (a: Vec, b: Vec) => a.map((v, i) => v - b[i]);
const dot = (a: Vec, b: Vec) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a: Vec, b: Vec) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// Spatial buckets + barycentric interpolation; material-interface nodes stay separate.
export function makeFieldSampler(data: FemFields) {
  const { lo, hi } = bounds(data.points), bins = 20;
  const span = hi.map((v, i) => v - lo[i]);
  const point = (id: number) => data.points.slice(id * 3, id * 3 + 3);
  const bucket = (p: Vec) => p.map((v, i) => Math.max(0, Math.min(bins - 1, Math.floor((v - lo[i]) / (span[i] || 1) * bins))));
  const key = (p: Vec) => p[0] + bins * (p[1] + bins * p[2]);
  const grid = new Map<number, number[]>();
  const cells: { ids: number[]; origin: Vec; rows: Vec[]; body: number }[] = [];
  for (const group of data.groups) for (let i = 0; i < group.tetrahedra.length; i += 4) {
    const ids = group.tetrahedra.slice(i, i + 4), nodes = ids.map(point), origin = nodes[0];
    const a = sub(nodes[1], origin), b = sub(nodes[2], origin), c = sub(nodes[3], origin);
    const det = dot(a, cross(b, c));
    if (Math.abs(det) < 1e-30) continue;
    const rows = [cross(b, c), cross(c, a), cross(a, b)].map(r => r.map(v => v / det));
    const index = cells.length; cells.push({ ids, origin, rows, body: group.id });
    const box = bounds(nodes.flat()), min = bucket(box.lo), max = bucket(box.hi);
    for (let x = min[0]; x <= max[0]; x++) for (let y = min[1]; y <= max[1]; y++) for (let z = min[2]; z <= max[2]; z++) {
      const k = key([x, y, z]); const entries = grid.get(k); if (entries) entries.push(index); else grid.set(k, [index]);
    }
  }
  return (p: Vec, body?: number): Vec | null => {
    if (p.some((v, i) => v < lo[i] || v > hi[i])) return null;
    for (const index of grid.get(key(bucket(p))) || []) {
      const cell = cells[index], delta = sub(p, cell.origin);
      if (body !== undefined && cell.body !== body) continue;
      const w = cell.rows.map(r => dot(r, delta)); w.unshift(1 - w.reduce((s, v) => s + v, 0));
      if (w.some(v => v < -1e-8 || v > 1 + 1e-8)) continue;
      return [0, 1, 2].map(axis => w.reduce((sum, weight, i) => sum + weight * data.fields.B.values[cell.ids[i] * 3 + axis], 0));
    }
    return null;
  };
}
// Spatially balanced interior seeds do not depend on Gmsh's triangle numbering.
// This balances the sampling, not the solution: never mirror or smooth B.
export function fieldLineSeeds(data: FemFields, sample = makeFieldSampler(data)): Vec[] {
  const point = (id: number) => data.points.slice(id * 3, id * 3 + 3);
  const groups = data.groups.filter(g => g.name !== "air" && g.tetrahedra.length && g.triangles.length)
    .map(group => ({ group, box: bounds(group.triangles.flatMap(point)) }))
    .sort((a, b) => a.box.lo[0] - b.box.lo[0] || a.box.lo[1] - b.box.lo[1] || a.box.lo[2] - b.box.lo[2]);
  const seeds: Vec[] = [], budget = Math.max(1, Math.floor(24 / Math.max(1, groups.length)));
  for (const { group, box } of groups.slice(0, 24)) {
    const nodes = [...new Set(group.tetrahedra)];
    const mean = [0, 1, 2].map(axis => nodes.reduce((sum, id) => sum + data.fields.B.values[3 * id + axis], 0));
    const axis = mean.reduce((best, v, i) => Math.abs(v) > Math.abs(mean[best]) ? i : best, 0);
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    const count = Math.min(3, Math.floor(Math.sqrt(budget))), bodySeeds: Vec[] = [];
    for (let i = 1; i <= count; i++) for (let j = 1; j <= count; j++) {
      const p = box.lo.map((x, k) => (x + box.hi[k]) / 2);
      p[u] = box.lo[u] + i / (count + 1) * (box.hi[u] - box.lo[u]);
      p[v] = box.lo[v] + j / (count + 1) * (box.hi[v] - box.lo[v]);
      const b = sample(p, group.id);
      if (b && Math.hypot(...b) > 1e-14) bodySeeds.push(p);
    }
    // Hollow/off-center bodies may not intersect the middle plane. Retain a
    // bounded surface fallback, ordered by coordinates rather than mesh IDs.
    if (!bodySeeds.length) {
      const centers: Vec[] = [];
      for (let i = 0; i < group.triangles.length; i += 3) {
        const tri = group.triangles.slice(i, i + 3).map(point);
        centers.push([0, 1, 2].map(k => tri.reduce((sum, p) => sum + p[k], 0) / 3));
      }
      centers.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
      for (let i = 0; i < Math.min(budget, centers.length); i++) bodySeeds.push(centers[Math.floor(i * centers.length / Math.min(budget, centers.length))]);
    }
    seeds.push(...bodySeeds);
  }
  return seeds;
}

export function traceDirection(sample: (p: Vec) => Vec | null, seed: Vec, sign: number, step: number): Vec[] {
  const direction = (p: Vec) => { const b = sample(p); if (!b) return null; const norm = Math.hypot(...b); return norm > 1e-14 ? b.map(v => v / norm) : null; };
  const midpoint = (p: Vec, h: number) => {
    const d = direction(p); if (!d) return null;
    const next = direction(p.map((v, j) => v + sign * h * d[j] / 2));
    return next ? p.map((v, j) => v + sign * h * next[j]) : null;
  };
  const points = [seed]; let p = seed, h = step, length = 0;
  const tolerance = step / 100, minimumStep = step / 64;
  for (let attempt = 0; attempt < 6000 && points.length < 1800 && length < 900 * step; attempt++) {
    const full = midpoint(p, h), half = midpoint(p, h / 2);
    const next = half && midpoint(half, h / 2);
    if (!full || !next || !sample(next)) {
      if (h > minimumStep) { h /= 2; continue; }
      break;
    }
    const error = Math.hypot(...sub(full, next));
    if (error > tolerance) {
      if (h > minimumStep) { h /= 2; continue; }
      break; // Do not draw a step that fails the local integration check.
    }
    const distance = Math.hypot(...sub(next, p));
    if (distance < minimumStep / 10) break;
    length += distance; p = next; points.push(p);
    if (points.length > 30 && points.slice(0, -20).some((q, n) => n % 5 === 0 && Math.hypot(...sub(p, q)) < h)) break;
    if (error < tolerance / 8) h = Math.min(step, 2 * h);
  }
  return points;
}

export function traceFieldLines(data: FemFields): number[][] {
  const sample = makeFieldSampler(data);
  const surfaces = data.groups.filter(g => g.name !== "air").flatMap(g => g.triangles);
  if (!surfaces.length) return [];
  const solidBox = bounds(surfaces.flatMap(i => data.points.slice(i * 3, i * 3 + 3)));
  const diagonal = Math.hypot(...sub(solidBox.hi, solidBox.lo)), step = diagonal / 100;
  if (!step) return [];
  const lines: number[][] = [];
  for (const seed of fieldLineSeeds(data, sample)) {
    const forward = traceDirection(sample, seed, 1, step), backward = traceDirection(sample, seed, -1, step);
    const line = [...backward.slice(1).reverse(), ...forward];
    if (line.length > 8) lines.push(line.flat());
  }
  return lines;
}
