import { useMemo, useState } from "react";
import { FlaskConical, Layers } from "lucide-react";

import { pushConsole } from "../consoleLog";
import {
  defaultGradeId,
  defaultGroupName,
  MRI_MATERIAL_CLASSES,
  MRI_MATERIAL_GRADES,
  materialFullLabel,
  type MriMaterialClassId,
} from "../mriMaterials";
import { listMaterialGroups, usePartInspectorStore } from "../partInspectorStore";
import type { ScannerModelId } from "../scannerModel";
import { Select, TextInput } from "./controls";

export function MaterialAssignForm({
  scannerId,
  partIds,
  compact = false,
}: {
  scannerId: ScannerModelId;
  partIds: string[];
  compact?: boolean;
}) {
  const groups = usePartInspectorStore((s) => listMaterialGroups(s, scannerId));
  const bindings = usePartInspectorStore((s) => s.bindings[scannerId]);
  const assignMaterial = usePartInspectorStore((s) => s.assignMaterial);
  const setPartsInSimulation = usePartInspectorStore((s) => s.setPartsInSimulation);
  const [classId, setClassId] = useState<MriMaterialClassId>("magnet");
  const grades = MRI_MATERIAL_GRADES[classId];
  const [gradeId, setGradeId] = useState(defaultGradeId("magnet"));
  const [target, setTarget] = useState("new");
  const [name, setName] = useState(defaultGroupName("magnet", defaultGradeId("magnet")));

  const matchingGroups = useMemo(
    () => groups.filter((group) => group.classId === classId),
    [classId, groups],
  );

  const simCount = partIds.filter((id) => bindings?.[id]?.inSimulation).length;
  const allIn = partIds.length > 0 && simCount === partIds.length;
  const noneIn = simCount === 0;

  function onClass(next: string) {
    const id = next as MriMaterialClassId;
    const grade = defaultGradeId(id);
    setClassId(id);
    setGradeId(grade);
    setTarget("new");
    setName(defaultGroupName(id, grade));
  }

  function onGrade(next: string) {
    setGradeId(next);
    if (target === "new") setName(defaultGroupName(classId, next));
  }

  function assign() {
    if (partIds.length === 0) return;
    const group = assignMaterial({
      scannerId,
      partIds,
      classId,
      gradeId,
      groupId: target === "new" ? null : target,
      name: target === "new" ? name : undefined,
    });
    pushConsole(
      "SUCCESS",
      `Assigned ${partIds.length} ${partIds.length === 1 ? "part" : "parts"} to ${group.name} (${materialFullLabel(group.classId, group.gradeId)})`,
    );
  }

  function setSim(on: boolean) {
    if (partIds.length === 0) return;
    setPartsInSimulation(scannerId, partIds, on);
    pushConsole(
      on ? "SUCCESS" : "INFO",
      on
        ? `Added ${partIds.length} ${partIds.length === 1 ? "part" : "parts"} to simulation`
        : `Removed ${partIds.length} ${partIds.length === 1 ? "part" : "parts"} from simulation`,
    );
  }

  return (
    <div className={`sw-mat-form${compact ? " is-compact" : ""}`}>
      <p className="sw-mat-form-kicker">
        <Layers size={14} strokeWidth={1.8} aria-hidden />
        MRI class
      </p>
      <label className="sw-field">
        <span className="sw-field-label">Class</span>
        <Select
          label="MRI material class"
          value={classId}
          onChange={onClass}
          options={MRI_MATERIAL_CLASSES.map((item) => ({
            value: item.id,
            label: item.label,
          }))}
        />
      </label>
      <label className="sw-field">
        <span className="sw-field-label">Grade</span>
        <Select
          label="Material grade"
          value={gradeId}
          onChange={onGrade}
          options={grades.map((item) => ({ value: item.id, label: item.label }))}
        />
      </label>
      <label className="sw-field">
        <span className="sw-field-label">Group</span>
        <Select
          label="Material group"
          value={target}
          onChange={setTarget}
          options={[
            { value: "new", label: "New group" },
            ...matchingGroups.map((group) => ({
              value: group.id,
              label: `${group.name} (${group.partIds.length})`,
            })),
          ]}
        />
      </label>
      {target === "new" ? (
        <label className="sw-field">
          <span className="sw-field-label">Group name</span>
          <TextInput label="Material group name" value={name} onChange={setName} />
        </label>
      ) : null}
      <div className="sw-mat-form-actions">
        <button type="button" className="settings-btn sw-mat-assign" onClick={assign}>
          Assign {partIds.length} {partIds.length === 1 ? "part" : "parts"}
        </button>
        {noneIn || !allIn ? (
          <button type="button" className="settings-btn" onClick={() => setSim(true)}>
            <FlaskConical size={14} strokeWidth={1.8} aria-hidden />
            Add to simulation
          </button>
        ) : null}
        {!noneIn ? (
          <button type="button" className="settings-btn" onClick={() => setSim(false)}>
            <FlaskConical size={14} strokeWidth={1.8} aria-hidden />
            Remove from simulation
          </button>
        ) : null}
      </div>
    </div>
  );
}
