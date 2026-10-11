import * as THREE from "three";
import { useAssemblyGeometryStore } from "./assemblyGeometryStore";
import { convertSize, geometryRevision, instanceIdFor, surfaceTopology, toMeters, type AssemblyInstance, type LengthUnit } from "./geometryPrep";

export { useAssemblyGeometryStore } from "./assemblyGeometryStore";
export { livePhysicalParts, physicalPartsForScanner } from "./assemblyModel";

export function collectAssemblyInstances(
  root: THREE.Object3D,
  sourceAssetId: string,
  units: LengthUnit = "m",
): AssemblyInstance[] {
  root.updateWorldMatrix(true, true);
  const groups = new Map<string, THREE.Object3D[]>();
  root.traverse((child) => {
    const partId = child.userData.partId as string | undefined;
    if (!partId) return;
    if (child.parent?.userData.partId === partId) return;
    const list = groups.get(partId);
    if (list) list.push(child);
    else groups.set(partId, [child]);
  });

  const instances: AssemblyInstance[] = [];
  for (const [partId, objects] of groups) {
    const sorted = [...objects].sort((a, b) => compareWorld(a, b));
    sorted.forEach((object, index) => {
      instances.push(instanceFromObject(object, partId, index, sorted.length, sourceAssetId, units));
    });
  }
  return instances.sort((a, b) => a.instanceId.localeCompare(b.instanceId));
}

function compareWorld(a: THREE.Object3D, b: THREE.Object3D): number {
  const pa = new THREE.Vector3().setFromMatrixPosition(a.matrixWorld);
  const pb = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
  if (pa.x !== pb.x) return pa.x - pb.x;
  if (pa.y !== pb.y) return pa.y - pb.y;
  return pa.z - pb.z;
}

function instanceFromObject(
  object: THREE.Object3D,
  partId: string,
  index: number,
  count: number,
  sourceAssetId: string,
  units: LengthUnit,
): AssemblyInstance {
  const box = new THREE.Box3();
  const positions: number[] = [];
  const indices: number[] = [];
  let vertexBase = 0;
  object.updateWorldMatrix(true, true);
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    const geometry = child.geometry;
    const position = geometry.getAttribute("position");
    if (!position) return;
    child.updateWorldMatrix(true, true);
    const meshBox = new THREE.Box3().setFromObject(child);
    if (!meshBox.isEmpty()) box.union(meshBox);
    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
    }
    const indexAttr = geometry.getIndex();
    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i += 1) indices.push(indexAttr.getX(i) + vertexBase);
    } else {
      for (let i = 0; i < position.count; i += 1) indices.push(vertexBase + i);
    }
    vertexBase += position.count;
  });
  const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
  const topology = surfaceTopology(positions, indices);
  const worldMatrix = object.matrixWorld.elements.slice();
  if (units === "mm") {
    worldMatrix[12] *= 1e-3;
    worldMatrix[13] *= 1e-3;
    worldMatrix[14] *= 1e-3;
  }
  const sizeM = convertSize([size.x, size.y, size.z], units);
  const translation = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
  const translationM: [number, number, number] = [
    toMeters(translation.x, units),
    toMeters(translation.y, units),
    toMeters(translation.z, units),
  ];
  return {
    instanceId: instanceIdFor(partId, index, count),
    partId,
    cadName: (object.userData.cadName as string | undefined) ?? partId,
    sourceAssetId,
    geometryRevision: geometryRevision({
      partId,
      vertexCount: topology.vertexCount,
      triangleCount: topology.triangleCount,
      sizeM,
      worldMatrix,
    }),
    worldMatrix,
    translationM,
    sizeM,
    units: "m",
    triangleCount: topology.triangleCount,
    vertexCount: topology.vertexCount,
    closed: topology.triangleCount > 0 ? topology.closed : null,
    degenerateFaces: topology.degenerateFaces,
    boundaryEdges: topology.boundaryEdges,
  };
}
