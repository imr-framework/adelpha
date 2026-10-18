/** Derive physical model inputs from included assembly instances. */

import type { EngineeringRole, MagnetizationFrame, PartEngineering } from "./engineering";

export type LengthUnit = "m" | "mm";

export type AssemblyInstance = {
  instanceId: string;
  partId: string;
  cadName: string;
  sourceAssetId: string;
  geometryRevision: string;
  worldMatrix: number[];
  translationM: [number, number, number];
  sizeM: [number, number, number];
  units: LengthUnit;
  triangleCount: number;
  vertexCount: number;
  closed: boolean | null;
  degenerateFaces: number;
  boundaryEdges: number;
};

export type PhysicalPart = AssemblyInstance & {
  visible: boolean;
  inSimulation: boolean;
  selected: boolean;
  engineering: PartEngineering;
};

export type GeometryIssue = {
  instanceId: string;
  partId: string;
  severity: "error" | "warning";
  code: string;
  message: string;
  correction: string;
};

export type MagnetizationWorld = {
  instanceId: string;
  local: [number, number, number];
  world: [number, number, number];
  frame: MagnetizationFrame;
};

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function identityMatrix(): number[] {
  return IDENTITY.slice();
}

export function multiplyMatrices(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

export function applyWorldOnce(localMatrix: number[], parentWorld: number[]): number[] {
  return multiplyMatrices(parentWorld, localMatrix);
}

export function translationOf(matrix: number[]): [number, number, number] {
  return [matrix[12] ?? 0, matrix[13] ?? 0, matrix[14] ?? 0];
}

export function rotationOf(matrix: number[]): [number, number, number, number, number, number, number, number, number] {
  const c0 = normalize3([matrix[0] ?? 1, matrix[1] ?? 0, matrix[2] ?? 0]);
  const c1 = normalize3([matrix[4] ?? 0, matrix[5] ?? 1, matrix[6] ?? 0]);
  const c2 = normalize3([matrix[8] ?? 0, matrix[9] ?? 0, matrix[10] ?? 1]);
  return [c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]];
}

export function scaleOf(matrix: number[]): [number, number, number] {
  return [
    Math.hypot(matrix[0] ?? 1, matrix[1] ?? 0, matrix[2] ?? 0),
    Math.hypot(matrix[4] ?? 0, matrix[5] ?? 1, matrix[6] ?? 0),
    Math.hypot(matrix[8] ?? 0, matrix[9] ?? 0, matrix[10] ?? 1),
  ];
}

export function rotateLocalVector(
  local: [number, number, number],
  worldMatrix: number[],
): [number, number, number] {
  const r = rotationOf(worldMatrix);
  return normalize3([
    r[0] * local[0] + r[3] * local[1] + r[6] * local[2],
    r[1] * local[0] + r[4] * local[1] + r[7] * local[2],
    r[2] * local[0] + r[5] * local[1] + r[8] * local[2],
  ]);
}

export function worldMagnetization(
  local: [number, number, number] | null,
  worldMatrix: number[],
  frame: MagnetizationFrame,
): [number, number, number] | null {
  if (!local) return null;
  const unit = normalize3(local);
  if (frame === "world") return unit;
  return rotateLocalVector(unit, worldMatrix);
}

export function toMeters(value: number, units: LengthUnit): number {
  return units === "mm" ? value * 1e-3 : value;
}

export function convertSize(size: [number, number, number], units: LengthUnit): [number, number, number] {
  const scale = units === "mm" ? 1e-3 : 1;
  return [size[0] * scale, size[1] * scale, size[2] * scale];
}

export function geometryRevision(input: {
  partId: string;
  vertexCount: number;
  triangleCount: number;
  sizeM: [number, number, number];
  worldMatrix: number[];
}): string {
  const rounded = [
    input.partId,
    input.vertexCount,
    input.triangleCount,
    ...input.sizeM.map((value) => value.toFixed(6)),
    ...input.worldMatrix.map((value) => value.toFixed(6)),
  ].join("|");
  return hashString(rounded);
}

export function instanceIdFor(partId: string, index: number, count: number): string {
  return count <= 1 ? partId : `${partId}::${index}`;
}

export function includedParts(parts: PhysicalPart[]): PhysicalPart[] {
  return parts.filter((part) => part.inSimulation);
}

export function physicalModelKey(parts: PhysicalPart[]): string {
  return includedParts(parts)
    .map((part) =>
      [
        part.instanceId,
        part.geometryRevision,
        part.worldMatrix.map((value) => value.toFixed(6)).join(","),
        part.engineering.role ?? "",
        part.engineering.remanenceT ?? "",
        part.engineering.magnetizationLocal?.map((value) => value.toFixed(6)).join(",") ?? "",
        part.engineering.magnetizationFrame,
        part.engineering.relativePermeability ?? "",
        part.engineering.conductivitySPerM ?? "",
      ].join("/"),
    )
    .sort()
    .join(";");
}

export function visibilityDoesNotChangeModel(parts: PhysicalPart[]): boolean {
  const hidden = parts.map((part) => ({ ...part, visible: false }));
  return physicalModelKey(parts) === physicalModelKey(hidden);
}

export function validateScale(sizeM: [number, number, number], units: LengthUnit): GeometryIssue | null {
  const max = Math.max(...sizeM);
  const min = Math.min(...sizeM.filter((value) => value > 0), max);
  if (max <= 0) {
    return {
      instanceId: "",
      partId: "",
      severity: "error",
      code: "ZERO_SIZE",
      message: "A part has zero physical size after its world transform.",
      correction: "Check the imported scale and the part’s placement.",
    };
  }
  if (max > 20) {
    return {
      instanceId: "",
      partId: "",
      severity: "warning",
      code: "LARGE_SCALE",
      message: `The largest extent is ${max.toFixed(2)} m. The model may still be in millimetres.`,
      correction: `Current units are ${units}. Confirm the imported GLB is in metres, or set millimetre units.`,
    };
  }
  if (min < 5e-4) {
    return {
      instanceId: "",
      partId: "",
      severity: "warning",
      code: "TINY_SCALE",
      message: `The smallest extent is ${(min * 1e3).toFixed(2)} mm.`,
      correction: "Confirm the imported scale. A millimetre mesh imported as metres will be far too small.",
    };
  }
  return null;
}

export function validateForMagnet(parts: PhysicalPart[]): GeometryIssue[] {
  const issues: GeometryIssue[] = [];
  if (includedParts(parts).length === 0) {
    issues.push({
      instanceId: "",
      partId: "",
      severity: "error",
      code: "NO_INCLUDED_PARTS",
      message: "No assembly parts are added to simulation.",
      correction: "Add the magnets and magnetic structures that should enter the physical model.",
    });
    return issues;
  }
  for (const part of includedParts(parts)) {
    const scale = validateScale(part.sizeM, part.units);
    if (scale) issues.push({ ...scale, instanceId: part.instanceId, partId: part.partId });
    if (part.engineering.role === "permanent_magnet") {
      if (part.engineering.remanenceT == null || part.engineering.remanenceT <= 0) {
        issues.push({
          instanceId: part.instanceId,
          partId: part.partId,
          severity: "error",
          code: "MISSING_REMANENCE",
          message: `${part.cadName} is a permanent magnet without remanence.`,
          correction: "Enter remanence in tesla, or exclude the part from simulation.",
        });
      }
      if (!part.engineering.magnetizationLocal) {
        issues.push({
          instanceId: part.instanceId,
          partId: part.partId,
          severity: "error",
          code: "MISSING_MAGNETIZATION",
          message: `${part.cadName} has no magnetization direction.`,
          correction: "Set a local or world-frame direction, or exclude the part.",
        });
      }
    } else if (part.engineering.role == null) {
      issues.push({
        instanceId: part.instanceId,
        partId: part.partId,
        severity: "error",
        code: "MISSING_ROLE",
        message: `${part.cadName} is included but has no engineering role.`,
        correction: "Assign permanent magnet, yoke, conductor, or nonmagnetic structure, or exclude the part.",
      });
    }
    if (part.sizeM.some((value) => !Number.isFinite(value) || value < 0)) {
      issues.push({
        instanceId: part.instanceId,
        partId: part.partId,
        severity: "error",
        code: "INVALID_DIMENSIONS",
        message: `${part.cadName} has invalid physical dimensions.`,
        correction: "Re-import the GLB or check nested transforms.",
      });
    }
  }
  return issues;
}

export function validateForFem(parts: PhysicalPart[], approximation: "imported_mesh" | "oriented_box"): GeometryIssue[] {
  const issues = validateForMagnet(parts);
  for (const part of includedParts(parts)) {
    if (part.engineering.role === "magnetic_yoke" && (part.engineering.relativePermeability == null || part.engineering.relativePermeability <= 0)) {
      issues.push({
        instanceId: part.instanceId,
        partId: part.partId,
        severity: "error",
        code: "MISSING_PERMEABILITY",
        message: `${part.cadName} is a magnetic yoke without relative permeability.`,
        correction: "Enter μr, or exclude the part from simulation.",
      });
    }
    if (part.engineering.role === "conductor" && (part.engineering.conductivitySPerM == null || part.engineering.conductivitySPerM < 0)) {
      issues.push({
        instanceId: part.instanceId,
        partId: part.partId,
        severity: "error",
        code: "MISSING_CONDUCTIVITY",
        message: `${part.cadName} is a conductor without conductivity.`,
        correction: "Enter conductivity in S/m, or exclude the part.",
      });
    }
    if (approximation === "imported_mesh") {
      if (part.closed === false) {
        issues.push({
          instanceId: part.instanceId,
          partId: part.partId,
          severity: "error",
          code: "OPEN_SURFACE",
          message: `${part.cadName} is not a closed volume (${part.boundaryEdges} boundary edges).`,
          correction: "Repair the imported mesh, or choose the oriented-box approximation for this study.",
        });
      }
      if (part.degenerateFaces > 0) {
        issues.push({
          instanceId: part.instanceId,
          partId: part.partId,
          severity: "warning",
          code: "DEGENERATE_FACES",
          message: `${part.cadName} has ${part.degenerateFaces} degenerate faces.`,
          correction: "Clean the mesh before volumetric FEM, or use the oriented-box approximation.",
        });
      }
      if (part.triangleCount < 4) {
        issues.push({
          instanceId: part.instanceId,
          partId: part.partId,
          severity: "error",
          code: "NO_VOLUME_MESH",
          message: `${part.cadName} does not have enough faces for a volume region.`,
          correction: "Import a solid body, or choose the oriented-box approximation.",
        });
      }
    }
  }
  return issues;
}

export function surfaceTopology(positions: number[], indices: number[]): {
  closed: boolean;
  degenerateFaces: number;
  boundaryEdges: number;
  triangleCount: number;
  vertexCount: number;
} {
  const vertexCount = Math.floor(positions.length / 3);
  const triangleCount = Math.floor(indices.length / 3);
  const edges = new Map<string, number>();
  let degenerateFaces = 0;
  for (let i = 0; i < triangleCount; i += 1) {
    const a = indices[i * 3];
    const b = indices[i * 3 + 1];
    const c = indices[i * 3 + 2];
    const area = triangleArea(positions, a, b, c);
    if (area < 1e-16) degenerateFaces += 1;
    addEdge(edges, a, b);
    addEdge(edges, b, c);
    addEdge(edges, c, a);
  }
  let boundaryEdges = 0;
  for (const count of edges.values()) {
    if (count !== 2) boundaryEdges += 1;
  }
  return {
    closed: triangleCount > 0 && boundaryEdges === 0,
    degenerateFaces,
    boundaryEdges,
    triangleCount,
    vertexCount,
  };
}

function addEdge(edges: Map<string, number>, a: number, b: number) {
  const key = a < b ? `${a}-${b}` : `${b}-${a}`;
  edges.set(key, (edges.get(key) ?? 0) + 1);
}

function triangleArea(positions: number[], a: number, b: number, c: number): number {
  const ax = positions[a * 3];
  const ay = positions[a * 3 + 1];
  const az = positions[a * 3 + 2];
  const abx = positions[b * 3] - ax;
  const aby = positions[b * 3 + 1] - ay;
  const abz = positions[b * 3 + 2] - az;
  const acx = positions[c * 3] - ax;
  const acy = positions[c * 3 + 1] - ay;
  const acz = positions[c * 3 + 2] - az;
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  return 0.5 * Math.hypot(cx, cy, cz);
}

export function normalize3(value: [number, number, number]): [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length < 1e-12) return [0, 0, 1];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function contributingRoles(parts: PhysicalPart[], roles: EngineeringRole[]): PhysicalPart[] {
  const allow = new Set(roles);
  return includedParts(parts).filter((part) => part.engineering.role && allow.has(part.engineering.role));
}
