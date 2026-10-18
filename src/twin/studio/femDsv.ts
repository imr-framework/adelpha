import { Triangle, Vector3 } from "three";
import type { FemFields } from "../mri/api";
import { bounds, scalar, type Component } from "./femFieldGeometry";
import { makeFieldSampler } from "./femStreamlines";

export type DsvConfig = { diameterMm: number; centerMm: number[]; component: Component; resolution: number };
export type DsvSample = { pointMm: number[]; vector: number[]; value: number; region: "volume" | "surface" };
export type DsvResult = { mean: number; min: number; max: number; rms: number; ppmPeakToPeak: number | null; ppmRms: number | null; samples: DsvSample[] };
export function validateDsv(c: DsvConfig): string | null {
  if (!Number.isFinite(c.diameterMm) || c.diameterMm <= 0) return "Enter a positive DSV diameter.";
  if (c.centerMm.length !== 3 || !c.centerMm.every(Number.isFinite)) return "Enter finite X, Y and Z center coordinates.";
  if (![17, 25, 33].includes(c.resolution)) return "Choose a supported sampling resolution.";
  if (!["magnitude", "x", "y", "z"].includes(c.component)) return "Choose a magnetic flux density component.";
  return null;
}
export function evaluateDsv(data: FemFields, config: DsvConfig): DsvResult {
  const error = validateDsv(config); if (error) throw new Error(error);
  const center = config.centerMm.map(v => v / 1000), radius = config.diameterMm / 2000;
  const box = bounds(data.points);
  if (center.some((v, i) => v - radius <= box.lo[i] || v + radius >= box.hi[i])) throw new Error("DSV must lie inside the solved air domain. Reduce its diameter or move its center.");
  const air = data.groups.find(g => g.name === "air");
  if (!air) throw new Error("This result has no air volume for DSV evaluation.");
  const sample = makeFieldSampler(data);
  if (!sample(center, air.id)) throw new Error("DSV center must be in the solved air volume.");
  // Detect even thin solids that fall between sampling points. Use the actual
  // exported surface mesh; do not infer clearance from a few point probes.
  const p = new Vector3(...center), closest = new Vector3(), tri = new Triangle();
  for (const group of data.groups) if (group.id !== air.id) {
    for (let i = 0; i < group.triangles.length; i += 3) {
      [tri.a, tri.b, tri.c].forEach((v, j) => v.fromArray(data.points, 3 * group.triangles[i + j]));
      tri.closestPointToPoint(p, closest);
      if (p.distanceToSquared(closest) <= radius * radius) throw new Error("DSV intersects a solid. Reduce its diameter or move its center into the imaging gap.");
    }
  }
  const samples: DsvSample[] = [];
  const add = (unit: number[], region: DsvSample["region"]) => {
    const position = center.map((v, i) => v + radius * unit[i]);
    const vector = sample(position, air.id);
    if (!vector) throw new Error("DSV is not fully covered by the solved air mesh. No partial homogeneity result is reported.");
    samples.push({ pointMm: position.map(v => v * 1000), vector, value: scalar(vector, config.component), region });
  };
  // Equal-spaced, equal-weight interior grid; boundary samples supplement extrema
  // but must not bias the volume mean or RMS toward the surface.
  const n = config.resolution;
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
    const u = [x, y, z].map(i => -1 + (2 * i + 1) / n);
    if (u.reduce((s, v) => s + v * v, 0) < 1) add(u, "volume");
  }
  const volume = samples.length;
  const count = n * n;
  for (let i = 0; i < count; i++) {
    const z = 1 - 2 * (i + .5) / count, r = Math.sqrt(1 - z * z), phi = i * Math.PI * (3 - Math.sqrt(5));
    add([r * Math.cos(phi), r * Math.sin(phi), z], "surface");
  }
  // Include exact axial extrema for affine fields, independent of surface density.
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) add([0, 1, 2].map(i => i === axis ? sign : 0), "surface");
  const mean = samples.slice(0, volume).reduce((s, v) => s + v.value, 0) / volume;
  const rms = Math.sqrt(samples.slice(0, volume).reduce((s, v) => s + (v.value - mean) ** 2, 0) / volume);
  const values = samples.map(s => s.value), min = Math.min(...values), max = Math.max(...values);
  const reference = Math.abs(mean);
  const validReference = reference > Math.max(1e-12, Math.max(Math.abs(min), Math.abs(max)) * 1e-9);
  return { mean, min, max, rms, ppmPeakToPeak: validReference ? (max - min) / reference * 1e6 : null, ppmRms: validReference ? rms / reference * 1e6 : null, samples };
}
export function dsvCsv(result: DsvResult, config: DsvConfig, jobId: string, source: string) {
  const quote = (v: unknown) => `"${String(v).replaceAll('"', '""')}"`;
  const metadata = { jobId, source, ...config, meanT: result.mean, minT: result.min, maxT: result.max, rmsT: result.rms,
    ppmPeakToPeak: result.ppmPeakToPeak, ppmRms: result.ppmRms, reference: "absolute volume-sampled mean", interpolation: "linear tetrahedral B vectors", extrema: "volume and surface samples" };
  return '# ' + JSON.stringify(metadata) + '\n' + ['region,x_mm,y_mm,z_mm,Bx_T,By_T,Bz_T,value_T',
    ...result.samples.map(s => [s.region, ...s.pointMm, ...s.vector, s.value].map(quote).join(','))].join('\n');
}
