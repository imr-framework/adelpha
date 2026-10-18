/** Engineering roles and physical properties for assembly-based hardware studies. */

export const ENGINEERING_ROLES = [
  {
    id: "permanent_magnet",
    label: "Permanent magnet",
    summary: "Remanence or magnetization and a direction.",
  },
  {
    id: "magnetic_yoke",
    label: "Magnetic yoke",
    summary: "Soft-magnetic structure with a relative permeability.",
  },
  {
    id: "conductor",
    label: "Conductor",
    summary: "Winding or bus bar with conductivity and optional current.",
  },
  {
    id: "nonmagnetic_structure",
    label: "Nonmagnetic structure",
    summary: "Housing or fixture that does not carry magnetization.",
  },
] as const;

export type EngineeringRole = (typeof ENGINEERING_ROLES)[number]["id"];

export type MagnetizationFrame = "local" | "world";

export type PartEngineering = {
  role: EngineeringRole | null;
  remanenceT: number | null;
  magnetizationLocal: [number, number, number] | null;
  magnetizationFrame: MagnetizationFrame;
  relativePermeability: number | null;
  conductivitySPerM: number | null;
};

export const EMPTY_ENGINEERING: PartEngineering = {
  role: null,
  remanenceT: null,
  magnetizationLocal: null,
  magnetizationFrame: "local",
  relativePermeability: null,
  conductivitySPerM: null,
};

export function isEngineeringRole(value: unknown): value is EngineeringRole {
  return ENGINEERING_ROLES.some((role) => role.id === value);
}

export function emptyEngineering(): PartEngineering {
  return { ...EMPTY_ENGINEERING, magnetizationLocal: null };
}

export function normalizeEngineering(value: unknown): PartEngineering {
  if (!value || typeof value !== "object") return emptyEngineering();
  const row = value as Record<string, unknown>;
  const local = asVec3(row.magnetizationLocal);
  return {
    role: isEngineeringRole(row.role) ? row.role : null,
    remanenceT: asFinite(row.remanenceT),
    magnetizationLocal: local,
    magnetizationFrame: row.magnetizationFrame === "world" ? "world" : "local",
    relativePermeability: asFinite(row.relativePermeability),
    conductivitySPerM: asFinite(row.conductivitySPerM),
  };
}

export function mergeEngineering(
  current: PartEngineering | undefined,
  patch: Partial<PartEngineering> | undefined,
): PartEngineering {
  const base = current ? { ...current } : emptyEngineering();
  if (!patch) return base;
  if (patch.role !== undefined) base.role = patch.role;
  if (patch.remanenceT !== undefined) base.remanenceT = patch.remanenceT;
  if (patch.magnetizationLocal !== undefined) base.magnetizationLocal = patch.magnetizationLocal;
  if (patch.magnetizationFrame !== undefined) base.magnetizationFrame = patch.magnetizationFrame;
  if (patch.relativePermeability !== undefined) base.relativePermeability = patch.relativePermeability;
  if (patch.conductivitySPerM !== undefined) base.conductivitySPerM = patch.conductivitySPerM;
  return base;
}

export function suggestedRole(classId: string | null | undefined): EngineeringRole | null {
  if (classId === "magnet") return "permanent_magnet";
  if (classId === "steel") return "magnetic_yoke";
  if (classId === "copper") return "conductor";
  if (classId === "plastic" || classId === "aluminium") return "nonmagnetic_structure";
  return null;
}

export function roleLabel(role: EngineeringRole | null): string {
  return ENGINEERING_ROLES.find((item) => item.id === role)?.label ?? "Unassigned role";
}

function asFinite(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function asVec3(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const next = value.map((item) => Number(item));
  if (next.some((item) => !Number.isFinite(item))) return null;
  const length = Math.hypot(next[0], next[1], next[2]);
  if (length < 1e-12) return null;
  return [next[0] / length, next[1] / length, next[2] / length];
}
