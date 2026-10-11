import { usePartInspectorStore, type PartBinding } from "../partInspectorStore";
import { useAssemblyGeometryStore } from "./assemblyGeometryStore";
import { emptyEngineering, type PartEngineering } from "./engineering";
import type { AssemblyInstance, PhysicalPart } from "./geometryPrep";

export function physicalPartsForScanner(
  scannerId: string,
  catalog: Record<string, { partId: string; cadName: string }[]>,
  bindings: Record<string, Record<string, PartBinding>>,
  hidden: string[],
  selectedIds: string[],
  instances: AssemblyInstance[],
): PhysicalPart[] {
  const hiddenSet = new Set(hidden);
  const selected = new Set(selectedIds);
  const catalogParts = catalog[scannerId] ?? [];
  const seen = new Set<string>();
  const rows: PhysicalPart[] = [];

  const push = (instance: AssemblyInstance, engineering: PartEngineering, inSimulation: boolean) => {
    if (seen.has(instance.instanceId)) return;
    seen.add(instance.instanceId);
    rows.push({
      ...instance,
      visible: !hiddenSet.has(instance.partId),
      inSimulation,
      selected: selected.has(instance.partId),
      engineering,
    });
  };

  for (const part of catalogParts) {
    const binding = bindings[scannerId]?.[part.partId];
    const engineering = binding?.engineering ?? emptyEngineering();
    const inSimulation = Boolean(binding?.inSimulation);
    const family = instances.filter((row) => row.partId === part.partId);
    if (family.length === 0) {
      push(
        {
          instanceId: part.partId,
          partId: part.partId,
          cadName: part.cadName,
          sourceAssetId: scannerId,
          geometryRevision: "pending",
          worldMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          translationM: [0, 0, 0],
          sizeM: [0, 0, 0],
          units: "m",
          triangleCount: 0,
          vertexCount: 0,
          closed: null,
          degenerateFaces: 0,
          boundaryEdges: 0,
        },
        engineering,
        inSimulation,
      );
      continue;
    }
    for (const instance of family) push(instance, engineering, inSimulation);
  }

  for (const instance of instances) {
    const binding = bindings[scannerId]?.[instance.partId];
    push(instance, binding?.engineering ?? emptyEngineering(), Boolean(binding?.inSimulation));
  }

  return rows.sort((a, b) => a.instanceId.localeCompare(b.instanceId));
}

export function livePhysicalParts(scannerId: string): PhysicalPart[] {
  const inspector = usePartInspectorStore.getState();
  const geometry = useAssemblyGeometryStore.getState();
  return physicalPartsForScanner(
    scannerId,
    inspector.catalog,
    inspector.bindings,
    inspector.hidden[scannerId] ?? [],
    inspector.selection.filter((part) => part.scannerId === scannerId).map((part) => part.partId),
    geometry.instances[scannerId] ?? [],
  );
}
