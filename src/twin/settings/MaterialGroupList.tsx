import { FlaskConical, Trash2 } from "lucide-react";

import { materialFullLabel } from "../mriMaterials";
import { listMaterialGroups, usePartInspectorStore } from "../partInspectorStore";
import type { ScannerModelId } from "../scannerModel";
import { StatusBadge } from "./controls";
import { pushConsole } from "../consoleLog";

export function MaterialGroupList({ scannerId }: { scannerId: ScannerModelId }) {
  const groups = usePartInspectorStore((s) => listMaterialGroups(s, scannerId));
  const selectGroup = usePartInspectorStore((s) => s.selectGroup);
  const setGroupInSimulation = usePartInspectorStore((s) => s.setGroupInSimulation);
  const dissolveGroup = usePartInspectorStore((s) => s.dissolveGroup);

  if (groups.length === 0) return null;

  return (
    <ul className="sw-mat-groups" aria-label="MRI material groups">
      {groups.map((group) => {
        const simLabel = group.inSimulation
          ? "In simulation"
          : `${group.partIds.length} ${group.partIds.length === 1 ? "part" : "parts"}`;
        return (
          <li key={group.id} className="sw-mat-group">
            <button
              type="button"
              className="sw-mat-group-main"
              onClick={() => selectGroup(scannerId, group.id)}
              title="Select every part in this group"
            >
              <strong>{group.name}</strong>
              <span>{materialFullLabel(group.classId, group.gradeId)}</span>
              <span className="sw-mat-group-count">{simLabel}</span>
            </button>
            {group.inSimulation ? (
              <StatusBadge tone="sim">Simulation</StatusBadge>
            ) : null}
            <button
              type="button"
              className="sw-icon-btn"
              title={group.inSimulation ? "Remove group from simulation" : "Add group to simulation"}
              aria-label={
                group.inSimulation
                  ? `Remove ${group.name} from simulation`
                  : `Add ${group.name} to simulation`
              }
              onClick={() => {
                setGroupInSimulation(scannerId, group.id, !group.inSimulation);
                pushConsole(
                  group.inSimulation ? "INFO" : "SUCCESS",
                  group.inSimulation
                    ? `Removed ${group.name} from simulation`
                    : `Added ${group.name} to simulation`,
                );
              }}
            >
              <FlaskConical size={15} strokeWidth={1.7} aria-hidden />
            </button>
            <button
              type="button"
              className="sw-icon-btn"
              title="Ungroup parts"
              aria-label={`Ungroup ${group.name}`}
              onClick={() => {
                dissolveGroup(scannerId, group.id);
                pushConsole("INFO", `Ungrouped ${group.name}`);
              }}
            >
              <Trash2 size={15} strokeWidth={1.7} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
