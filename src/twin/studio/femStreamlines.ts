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
  const cells: { ids: number[]; origin: Vec; rows: Vec[] }[] = [];
  for (const group of data.groups) for (let i = 0; i < group.tetrahedra.length; i += 4) {
    const ids = group.tetrahedra.slice(i, i + 4), nodes = ids.map(point), origin = nodes[0];
    const a = sub(nodes[1], origin), b = sub(nodes[2], origin), c = sub(nodes[3], origin);
    const det = dot(a, cross(b, c));
    if (Math.abs(det) < 1e-30) continue;
    const rows = [cross(b, c), cross(c, a), cross(a, b)].map(r => r.map(v => v / det));
    const index = cells.length; cells.push({ ids, origin, rows });
    const box = bounds(nodes.flat()), min = bucket(box.lo), max = bucket(box.hi);
    for (let x = min[0]; x <= max[0]; x++) for (let y = min[1]; y <= max[1]; y++) for (let z = min[2]; z <= max[2]; z++) {
      const k = key([x, y, z]); const entries = grid.get(k); if (entries) entries.push(index); else grid.set(k, [index]);
    }
  }
  return (p: Vec): Vec | null => {
    if (p.some((v, i) => v < lo[i] || v > hi[i])) return null;
    for (const index of grid.get(key(bucket(p))) || []) {
      const cell = cells[index], delta = sub(p, cell.origin);
      const w = cell.rows.map(r => dot(r, delta)); w.unshift(1 - w.reduce((s, v) => s + v, 0));
      if (w.some(v => v < -1e-8 || v > 1 + 1e-8)) continue;
      return [0, 1, 2].map(axis => w.reduce((sum, weight, i) => sum + weight * data.fields.B.values[cell.ids[i] * 3 + axis], 0));
    }
    return null;
  };
}
export function traceFieldLines(data: FemFields): number[][] {
  const sample = makeFieldSampler(data);
  const surfaces = data.groups.filter(g => g.name !== "air").flatMap(g => g.triangles);
  if (!surfaces.length) return [];
  const solidBox = bounds(surfaces.flatMap(i => data.points.slice(i * 3, i * 3 + 3)));
  const diagonal = Math.hypot(...sub(solidBox.hi, solidBox.lo)), step = diagonal / 100;
  if (!step) return [];
  const direction = (p: Vec) => { const b = sample(p); if (!b) return null; const norm = Math.hypot(...b); return norm > 1e-14 ? b.map(v => v / norm) : null; };
  const trace = (seed: Vec, sign: number) => {
    const points = [seed]; let p = seed;
    for (let i = 0; i < 900; i++) {
      const d = direction(p); if (!d) break;
      const mid = p.map((v, j) => v + sign * step * d[j] / 2), next = direction(mid); if (!next) break;
      p = p.map((v, j) => v + sign * step * next[j]);
      if (!sample(p)) break;
      points.push(p);
      // Stop closed/recirculating paths instead of repeatedly drawing the same loop.
      if (i > 30 && points.slice(0, -20).some((q, n) => n % 5 === 0 && Math.hypot(...sub(p, q)) < step)) break;
    }
    return points;
  };
  const lines: number[][] = [], triangles = surfaces.length / 3;
  for (let n = 0; n < Math.min(24, triangles); n++) {
    const i = Math.floor(n * triangles / Math.min(24, triangles)) * 3;
    const seed = [0, 1, 2].map(axis => surfaces.slice(i, i + 3).reduce((sum, id) => sum + data.points[id * 3 + axis], 0) / 3);
    const forward = trace(seed, 1), backward = trace(seed, -1);
    const line = [...backward.slice(1).reverse(), ...forward];
    if (line.length > 8) lines.push(line.flat());
  }
  return lines;
}
