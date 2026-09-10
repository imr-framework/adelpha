/** MRI-relevant materials a CAD body can be classified as. */

export const MRI_MATERIAL_CLASSES = [
  { id: "magnet", label: "Magnet", description: "Permanent magnets" },
  { id: "copper", label: "Copper", description: "Conductors and windings" },
  { id: "plastic", label: "Plastic", description: "Polymers and printed parts" },
  { id: "steel", label: "Steel", description: "Structural and magnetic steels" },
  { id: "aluminium", label: "Aluminium", description: "Non-ferrous structure" },
] as const;

export type MriMaterialClassId = (typeof MRI_MATERIAL_CLASSES)[number]["id"];

export const MRI_MATERIAL_GRADES: Record<
  MriMaterialClassId,
  ReadonlyArray<{ id: string; label: string }>
> = {
  magnet: [
    { id: "neodymium", label: "Neodymium (NdFeB)" },
    { id: "ferrite", label: "Ferrite" },
    { id: "smco", label: "Samarium-cobalt" },
    { id: "other", label: "Other permanent magnet" },
  ],
  copper: [
    { id: "copper", label: "Copper" },
    { id: "ofhc", label: "OFHC copper" },
  ],
  plastic: [
    { id: "pla", label: "PLA" },
    { id: "tpu", label: "TPU" },
    { id: "abs", label: "ABS" },
    { id: "petg", label: "PETG" },
    { id: "other", label: "Other polymer" },
  ],
  steel: [
    { id: "carbon", label: "Carbon steel" },
    { id: "stainless", label: "Stainless steel" },
  ],
  aluminium: [{ id: "aluminium", label: "Aluminium" }],
};

/** Viewport / list tint applied when a part has no custom color yet. */
export const MRI_CLASS_COLOR: Record<MriMaterialClassId, string> = {
  magnet: "#8260fb",
  copper: "#c46b3a",
  plastic: "#3ee4a4",
  steel: "#9aa3b0",
  aluminium: "#c5d4e0",
};

export type MaterialGroup = {
  id: string;
  name: string;
  classId: MriMaterialClassId;
  gradeId: string;
  partIds: string[];
  inSimulation: boolean;
};

export function isMriMaterialClassId(value: string): value is MriMaterialClassId {
  return MRI_MATERIAL_CLASSES.some((item) => item.id === value);
}

export function defaultGradeId(classId: MriMaterialClassId): string {
  return MRI_MATERIAL_GRADES[classId][0]?.id ?? classId;
}

export function materialClassLabel(classId: MriMaterialClassId): string {
  return MRI_MATERIAL_CLASSES.find((item) => item.id === classId)?.label ?? classId;
}

export function materialGradeLabel(classId: MriMaterialClassId, gradeId: string): string {
  return MRI_MATERIAL_GRADES[classId].find((item) => item.id === gradeId)?.label ?? gradeId;
}

export function materialFullLabel(classId: MriMaterialClassId, gradeId: string): string {
  const grade = materialGradeLabel(classId, gradeId);
  const klass = materialClassLabel(classId);
  if (grade.toLowerCase() === klass.toLowerCase()) return klass;
  return `${klass} · ${grade}`;
}

export function defaultGroupName(classId: MriMaterialClassId, gradeId: string): string {
  if (classId === "magnet") return materialGradeLabel(classId, gradeId);
  if (classId === "plastic") return materialGradeLabel(classId, gradeId);
  return materialClassLabel(classId);
}

export function newMaterialGroupId(): string {
  return `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
