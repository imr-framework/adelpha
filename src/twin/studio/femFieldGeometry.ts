import type { FemFields } from "../mri/api";
export type Component = "magnitude" | "x" | "y" | "z";
export type Sample = { point: number[]; vector: number[] };
export function scalar(vector: number[], component: Component) {
  return component === "magnitude" ? Math.hypot(...vector) : vector[{ x: 0, y: 1, z: 2 }[component]];
}
export function bounds(points: number[]) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < points.length; i++) { const axis = i % 3; lo[axis] = Math.min(lo[axis], points[i]); hi[axis] = Math.max(hi[axis], points[i]); }
  return { lo, hi };
}
// Interpolate vectors before taking magnitude. Never connect separate material bodies.
export function fieldTriangles(data: FemFields, field: "B" | "H" | "A", mode: "surface" | "slice", axis: number, offset: number, air: boolean): Sample[] {
  const values = data.fields[field].values;
  const at = (i: number): Sample => ({ point: data.points.slice(i * 3, i * 3 + 3), vector: values.slice(i * 3, i * 3 + 3) });
  const output: Sample[] = [];
  const extent = bounds(data.points);
  const epsilon = Math.max(...extent.hi.map((v, i) => v - extent.lo[i])) * 1e-9;
  for (const group of data.groups) {
    if (!air && group.name === "air") continue;
    if (mode === "surface") { for (const i of group.triangles) output.push(at(i)); continue; }
    for (let i = 0; i < group.tetrahedra.length; i += 4) {
      const nodes = group.tetrahedra.slice(i, i + 4).map(at);
      const cuts: Sample[] = [];
      const add = (s: Sample) => { if (!cuts.some(c => Math.hypot(...c.point.map((v, j) => v - s.point[j])) < epsilon)) cuts.push(s); };
      for (const n of nodes) if (Math.abs(n.point[axis] - offset) < epsilon) add(n);
      for (const [a, b] of [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]) {
        const u = nodes[a], v = nodes[b], da = u.point[axis] - offset, db = v.point[axis] - offset;
        if (da * db >= 0) continue;
        const t = da / (da - db);
        add({ point: u.point.map((x, j) => x + t * (v.point[j] - x)), vector: u.vector.map((x, j) => x + t * (v.vector[j] - x)) });
      }
      if (cuts.length < 3) continue;
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      const center = [0, 1, 2].map(j => cuts.reduce((sum, c) => sum + c.point[j], 0) / cuts.length);
      cuts.sort((a, b) => Math.atan2(a.point[v] - center[v], a.point[u] - center[u]) - Math.atan2(b.point[v] - center[v], b.point[u] - center[u]));
      for (let j = 1; j < cuts.length - 1; j++) output.push(cuts[0], cuts[j], cuts[j + 1]);
    }
  }
  return output;
}
export const palette = [[.12, .16, .44], [.12, .43, .67], [.12, .7, .65], [.65, .84, .37], [.99, .87, .25]];
export function fieldColor(value: number, min: number, max: number): number[] {
  const t = max === min ? .5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const x = t * (palette.length - 1), i = Math.min(palette.length - 2, Math.floor(x));
  return palette[i].map((v, j) => v + (x - i) * (palette[i + 1][j] - v));
}
