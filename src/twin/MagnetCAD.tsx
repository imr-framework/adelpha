import type { MutableRefObject, ReactNode } from "react";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { isImportedModelId } from "./importedModels";
import { useFrame, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import type CameraControlsImpl from "camera-controls";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  isPartColorHex,
  listSimulationPartIds,
  usePartInspectorStore,
  type CadPartRef,
  type PartBinding,
} from "./partInspectorStore";
import {
  readScannerModel,
  setScannerModel,
  useScannerModel,
  type ScannerModelId,
} from "./scannerModel";
import { subscribePartFocus } from "./viewportFocus";
import { useCadPerfStore } from "./cadPerf";

const CAD_TECH_COLOR = new THREE.Color("#5f748a");
const CAD_TECH_EMISSIVE = new THREE.Color("#113047");
const CAD_SOLID_COLOR = new THREE.Color("#f2f5f8");
const CAD_ENGINEERING_COLOR = new THREE.Color("#c5ccd6");
const CAD_WIREFRAME_COLOR = new THREE.Color("#cfefff");
const CAD_WIREFRAME_EMISSIVE = new THREE.Color("#8dd8ff");
const CAD_EDGE_COLOR = new THREE.Color("#e3f6ff");
const CAD_SELECT_EMISSIVE = new THREE.Color("#8260fb");
const PART_CLICK_PX = 6;
const PART_COLOR_SCRATCH = new THREE.Color();

function snapshotCadMaterial(material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial) {
  material.userData.cadRest = {
    color: material.color.clone(),
    map: material.map,
    emissive: material.emissive.clone(),
    emissiveIntensity: material.emissiveIntensity,
    metalness: material.metalness,
    roughness: material.roughness,
    opacity: material.opacity,
    transparent: material.transparent,
    depthWrite: material.depthWrite,
    wireframe: material.wireframe,
    envMapIntensity: material.envMapIntensity,
    side: material.side,
  };
}

function restoreCadMaterial(material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial) {
  const rest = material.userData.cadRest as
    | {
        color: THREE.Color;
        map: THREE.Texture | null;
        emissive: THREE.Color;
        emissiveIntensity: number;
        metalness: number;
        roughness: number;
        opacity: number;
        transparent: boolean;
        depthWrite: boolean;
        wireframe: boolean;
        envMapIntensity: number;
        side: THREE.Side;
      }
    | undefined;
  if (!rest) return;
  material.color.copy(rest.color);
  material.map = rest.map;
  material.emissive.copy(rest.emissive);
  material.emissiveIntensity = rest.emissiveIntensity;
  material.metalness = rest.metalness;
  material.roughness = rest.roughness;
  material.opacity = rest.opacity;
  material.transparent = rest.transparent;
  material.depthWrite = rest.depthWrite;
  material.wireframe = rest.wireframe;
  material.envMapIntensity = rest.envMapIntensity;
  material.side = rest.side;
  material.needsUpdate = true;
}

function applyCadSolidLook(
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  emissiveIntensity = 0.04,
) {
  const rest = material.userData.cadRest as
    | {
        color: THREE.Color;
        map: THREE.Texture | null;
      }
    | undefined;
  if (rest) {
    material.color.copy(rest.color);
    material.map = rest.map;
  } else {
    material.map = null;
    material.color.copy(CAD_SOLID_COLOR);
  }
  material.emissive.set("#0c1218");
  material.emissiveIntensity = emissiveIntensity;
  material.metalness = 0.4;
  material.roughness = 0.38;
  material.transparent = false;
  material.opacity = 1;
  material.depthWrite = true;
  material.wireframe = false;
  material.flatShading = false;
  material.needsUpdate = true;
}

/** Uniform machined grey — the previous Adelpha studio metal. */
function applyCadPolishedLook(
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  emissiveIntensity = 0.04,
) {
  material.map = null;
  material.color.copy(CAD_SOLID_COLOR);
  material.emissive.copy(CAD_TECH_EMISSIVE);
  material.emissiveIntensity = emissiveIntensity;
  material.metalness = 0.58;
  material.roughness = 0.3;
  material.transparent = false;
  material.opacity = 1;
  material.depthWrite = true;
  material.wireframe = false;
  material.flatShading = false;
  material.needsUpdate = true;
}

function applyCadHybridLook(
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  polished: boolean,
) {
  if (polished) applyCadPolishedLook(material, 0.06);
  else applyCadSolidLook(material, 0.06);
  material.metalness = 0.62;
  material.roughness = 0.24;
}

/** Neutral machined finish for CAD that shipped without a usable albedo. */
function refineUnlitCadMaterial(material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial) {
  material.flatShading = false;
  if (material.map) return;
  const hsl = { h: 0, s: 0, l: 0 };
  material.color.getHSL(hsl);
  if (hsl.l >= 0.04) return;
  material.color.copy(CAD_ENGINEERING_COLOR);
  material.metalness = 0.4;
  material.roughness = 0.38;
  material.emissive.set("#10141c");
  material.emissiveIntensity = 0.03;
}

function applyCadDisplayLook(
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  useModelColors: boolean,
  hybrid: boolean,
  polished: boolean,
) {
  if (useModelColors) restoreCadMaterial(material);
  else if (hybrid) applyCadHybridLook(material, polished);
  else if (polished) applyCadPolishedLook(material);
  else applyCadSolidLook(material);
}

function applyCadWireframeLook(
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  sparkle: number,
  showTemperatureMap: boolean,
) {
  material.color.copy(CAD_WIREFRAME_COLOR);
  material.emissive.copy(CAD_WIREFRAME_EMISSIVE);
  material.emissiveIntensity = showTemperatureMap ? 0.12 : 0.48 * sparkle;
  material.metalness = 0.78;
  material.roughness = 0.18;
  material.transparent = true;
  material.opacity = 0.96;
  material.depthWrite = false;
  material.wireframe = true;
  material.side = THREE.DoubleSide;
}

type ThermalUniforms = {
  uThermal: { value: number };
  uTime: { value: number };
  uHeatEnabled: { value: number };
};

function ensureThermalShader(material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial) {
  if (material.userData.thermalShaderPatched) return;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uThermal = { value: 0 };
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uHeatEnabled = { value: 0 };
    material.userData.thermalUniforms = shader.uniforms as ThermalUniforms;

    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        `
varying vec3 vLocalPos;
void main() {
`,
      )
      .replace(
        "#include <begin_vertex>",
        `
#include <begin_vertex>
vLocalPos = transformed;
`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `
uniform float uThermal;
uniform float uTime;
uniform float uHeatEnabled;
varying vec3 vLocalPos;
void main() {
`,
      )
      .replace(
        "vec3 totalEmissiveRadiance = emissive;",
        `
vec3 totalEmissiveRadiance = emissive;
float bandA = sin(vLocalPos.y * 7.5 + uTime * 1.8) * 0.5 + 0.5;
float bandB = cos(vLocalPos.z * 8.5 - uTime * 1.2) * 0.5 + 0.5;
float swirl = sin(length(vLocalPos.xz) * 16.0 - uTime * 2.1) * 0.5 + 0.5;
float thermalNoise = 0.45 * bandA + 0.35 * bandB + 0.2 * swirl;
float heatMask = clamp(thermalNoise * (0.15 + 0.95 * uThermal), 0.0, 1.0);
float t = smoothstep(0.08, 0.98, heatMask);
vec3 c0 = vec3(0.05, 0.0, 0.0);   // near-black
vec3 c1 = vec3(0.34, 0.0, 0.0);   // deep red
vec3 c2 = vec3(0.78, 0.05, 0.02); // red
vec3 c3 = vec3(1.0, 0.33, 0.05);  // orange
vec3 c4 = vec3(1.0, 0.12, 0.24);  // electric-red hotspot
vec3 heatColor = mix(c0, c1, smoothstep(0.00, 0.25, t));
heatColor = mix(heatColor, c2, smoothstep(0.22, 0.52, t));
heatColor = mix(heatColor, c3, smoothstep(0.48, 0.78, t));
heatColor = mix(heatColor, c4, smoothstep(0.75, 1.00, t));
float emissiveGain = mix(0.25, 1.15, t);
totalEmissiveRadiance += heatColor * emissiveGain * uHeatEnabled;
`,
      );
  };
  material.userData.thermalShaderPatched = true;
  material.needsUpdate = true;
}

type ExplodePart = {
  object: THREE.Object3D;
  restLocal: THREE.Vector3;
  /** Parent-local translation at exploded = 1. */
  localDelta: THREE.Vector3;
};

type MagnetMotionProps = {
  exploded: number;
  b0Ratio: number;
  scale: number;
  rotation: [number, number, number];
  position: [number, number, number];
  model: THREE.Object3D;
  /** Uniform scale-up explode. Off when the mesh explodes named parts instead. */
  scaleExplode: boolean;
  explodeParts?: boolean;
  explodeRef?: MutableRefObject<{ parts: ExplodePart[]; distance: number }>;
  onlyInSimulation?: boolean;
};

type PartRootMap = Map<string, THREE.Object3D[]>;

/** Catalog rows stay bounded; instance families (magnet cubes) share one row. */
const MAX_TAGGED_PARTS = 128;
/** Repeated identical bodies — Halbach cubes — count as one part, not 128 leftovers. */
const INSTANCE_FAMILY_MIN = 4;

function roundCadDim(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function meshGeometryKey(mesh: THREE.Mesh): string {
  const geo = mesh.geometry;
  const verts = geo.getAttribute("position")?.count ?? 0;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const size = geo.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3();
  const dims = [roundCadDim(size.x), roundCadDim(size.y), roundCadDim(size.z)].sort((a, b) => a - b);
  // Bucket verts so identical cubes with tiny tessellation drift still group.
  const vertBucket = Math.round(verts / 12) * 12;
  return `${vertBucket}:${dims.join("x")}`;
}

function objectFamilyKey(object: THREE.Object3D): string {
  if (object instanceof THREE.Mesh) return `mesh:${meshGeometryKey(object)}`;
  const meshes: THREE.Mesh[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  if (meshes.length === 1 && meshes[0]) return `mesh:${meshGeometryKey(meshes[0])}`;
  if (meshes.length > 1) {
    return `group:${meshes.map((mesh) => meshGeometryKey(mesh)).sort().join("|")}`;
  }
  return `id:${object.id}`;
}

function stripInstanceSuffix(name: string): string {
  return name.replace(/[\s._-]*\d+$/, "").trim();
}

function familyCadName(objects: THREE.Object3D[]): string {
  const named = objects.map((obj) => stripInstanceSuffix(obj.name)).find((name) => name.length > 0);
  if (!named) return "Magnets";
  if (/magnet|halbach|cube|box|block|ndfeb|brick/i.test(named)) {
    return /magnet|halbach/i.test(named) ? named : "Magnets";
  }
  return named;
}

function tagSelectableParts(root: THREE.Object3D, fallbackName: string) {
  const used = new Set<string>();

  const apply = (obj: THREE.Object3D, partId: string, cadName: string) => {
    obj.traverse((child) => {
      child.userData.partId = partId;
      child.userData.cadName = cadName;
    });
  };

  const uniqueId = (name: string, index: number) => {
    const base = name.trim() || `part-${index + 1}`;
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };

  const host = root.getObjectByName("assembly");
  if (host && visibleChildren(host).length >= 2) {
    tagRankedObjects(visibleChildren(host), apply, uniqueId);
    return;
  }

  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.visible) meshes.push(obj);
  });
  if (meshes.length < 2) {
    apply(root, fallbackName, fallbackName);
    return;
  }
  tagRankedObjects(meshes, apply, uniqueId);
}

function tagRankedObjects(
  objects: THREE.Object3D[],
  apply: (obj: THREE.Object3D, partId: string, cadName: string) => void,
  uniqueId: (name: string, index: number) => string,
) {
  const buckets = new Map<string, THREE.Object3D[]>();
  for (const object of objects) {
    const key = objectFamilyKey(object);
    const list = buckets.get(key);
    if (list) list.push(object);
    else buckets.set(key, [object]);
  }

  const tagged = new Set<THREE.Object3D>();
  let slots = MAX_TAGGED_PARTS;
  const families = [...buckets.values()].sort((a, b) => b.length - a.length);
  for (const family of families) {
    if (slots <= 0) break;
    if (family.length < INSTANCE_FAMILY_MIN) continue;
    const cadName = familyCadName(family);
    const partId = uniqueId(cadName, 0);
    for (const object of family) {
      apply(object, partId, cadName);
      tagged.add(object);
    }
    slots -= 1;
  }

  const leftovers = objects
    .filter((object) => !tagged.has(object))
    .map((object, index) => {
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      return { object, index, span: Math.max(size.x, size.y, size.z) };
    })
    .sort((a, b) => b.span - a.span)
    .slice(0, slots);
  for (const row of leftovers) {
    const cadName = row.object.name.trim() || `Part ${row.index + 1}`;
    apply(row.object, uniqueId(row.object.name, row.index), cadName);
  }
}

/**
 * Topmost node(s) per part. Instance families (magnet cubes) share an id, so a
 * part may have many roots. Deeper tagged nodes are left alone so per-frame
 * looks (edge overlays) keep control of their own `visible` flag.
 */
function collectPartRoots(root: THREE.Object3D): PartRootMap {
  const roots: PartRootMap = new Map();
  root.traverse((child) => {
    const partId = child.userData.partId as string | undefined;
    if (!partId) return;
    if (child.parent?.userData.partId === partId) return;
    const list = roots.get(partId);
    if (list) list.push(child);
    else roots.set(partId, [child]);
  });
  return roots;
}

function applyPartVisibility(
  roots: PartRootMap,
  hidden: Set<string>,
  allowIds: Set<string> | null,
  sceneRoot?: THREE.Object3D | null,
) {
  // Digital Twin: only the hidden-parts tray culls tagged bodies.
  if (!allowIds) {
    if (sceneRoot) sceneRoot.visible = true;
    for (const [partId, objects] of roots) {
      const show = !hidden.has(partId);
      for (const object of objects) object.visible = show;
    }
    return;
  }

  // Engineering Studio: show only In-simulation parts. Untagged meshes
  // (lettering, fasteners, anything past MAX_TAGGED_PARTS) must stay off.
  if (sceneRoot) {
    if (allowIds.size === 0) {
      sceneRoot.visible = false;
      return;
    }
    sceneRoot.visible = true;
    sceneRoot.traverse((child) => {
      if (child !== sceneRoot) child.visible = false;
    });
  }
  for (const [partId, objects] of roots) {
    if (!allowIds.has(partId) || hidden.has(partId)) continue;
    for (const object of objects) {
      let node: THREE.Object3D | null = object;
      while (node) {
        node.visible = true;
        if (node === sceneRoot) break;
        node = node.parent;
      }
      object.traverse((child) => {
        if (child instanceof THREE.LineSegments) return;
        child.visible = true;
      });
    }
  }
}

const FOCUS_POSITION = new THREE.Vector3();
const FOCUS_TARGET = new THREE.Vector3();

/** Outermost transform group for the loaded assembly (scale, rotation, explode). */
function assemblyRoot(object: THREE.Object3D): THREE.Object3D {
  let node = object;
  while (node.parent && node.parent.type !== "Scene") node = node.parent;
  return node;
}

/**
 * Frame a single part when settings asks for it. Needs `makeDefault` on the
 * scene's `CameraControls` so `state.controls` resolves here.
 */
function usePartFocus(
  scannerId: ScannerModelId,
  partRootsRef: MutableRefObject<PartRootMap>,
) {
  const controls = useThree((state) => state.controls) as CameraControlsImpl | null;
  const showPart = usePartInspectorStore((s) => s.showPart);
  const selectPart = usePartInspectorStore((s) => s.selectPart);

  useEffect(() => {
    return subscribePartFocus((request) => {
      if (request.scannerId !== scannerId || !controls) return;
      const objects = partRootsRef.current.get(request.partId);
      const object = objects?.[0];
      if (!object || !objects) return;
      // A part the user culled earlier cannot be framed while it stays hidden.
      showPart(scannerId, request.partId);
      selectPart({
        partId: request.partId,
        cadName: (object.userData.cadName as string | undefined) ?? request.partId,
        scannerId,
      });
      const partBox = new THREE.Box3();
      for (const node of objects) {
        node.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(node);
        if (!box.isEmpty()) partBox.union(box);
      }
      if (partBox.isEmpty()) return;
      const center = partBox.getCenter(new THREE.Vector3());
      const partSpan = Math.max(...partBox.getSize(new THREE.Vector3()).toArray());

      // A single CAD part is often millimetres across inside a metre-scale
      // assembly. Fitting the camera to its box alone parks the near plane
      // inside the surrounding hardware and renders black, so re-centre on the
      // part but keep the camera outside the assembly's bounding sphere.
      const root = assemblyRoot(object);
      root.updateWorldMatrix(true, true);
      const radius = new THREE.Box3()
        .setFromObject(root)
        .getBoundingSphere(new THREE.Sphere()).radius;
      const safe = radius * 1.05;
      const distance = Math.min(Math.max(partSpan * 2.2, safe), radius * 2.5);

      const offset = controls
        .getPosition(FOCUS_POSITION, false)
        .sub(controls.getTarget(FOCUS_TARGET, false));
      if (offset.lengthSq() < 1e-12) offset.set(0, 0, 1);
      // Keeping the current direction respects the active orbit limits.
      offset.normalize().multiplyScalar(distance).add(center);
      void controls.setLookAt(
        offset.x,
        offset.y,
        offset.z,
        center.x,
        center.y,
        center.z,
        true,
      );
    });
  }, [controls, partRootsRef, scannerId, selectPart, showPart]);
}

function collectTaggedParts(root: THREE.Object3D): CadPartRef[] {
  const seen = new Map<string, CadPartRef>();
  root.traverse((child) => {
    const partId = child.userData.partId as string | undefined;
    const cadName = child.userData.cadName as string | undefined;
    if (!partId || seen.has(partId)) return;
    seen.set(partId, { partId, cadName: cadName || partId });
  });
  return [...seen.values()];
}

function applyPartAppearance(
  root: THREE.Object3D,
  scannerBindings: Record<string, PartBinding> | undefined,
  selectedPartIds: Set<string>,
  wireframe: boolean,
) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const partId = child.userData.partId as string | undefined;
    if (!partId) return;
    const hex = isPartColorHex(scannerBindings?.[partId]?.colorHex)
      ? scannerBindings[partId].colorHex
      : null;
    const selected = selectedPartIds.has(partId);
    if (!hex && !selected) return;

    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial)) {
        continue;
      }
      if (hex) {
        PART_COLOR_SCRATCH.set(hex);
        mat.color.copy(PART_COLOR_SCRATCH);
      }
      if (selected) {
        mat.emissive.copy(CAD_SELECT_EMISSIVE);
        mat.emissiveIntensity = wireframe ? 0.9 : 0.38;
      } else if (hex) {
        mat.emissive.copy(PART_COLOR_SCRATCH);
        mat.emissiveIntensity = wireframe ? 0.62 : 0.18;
      }
    }

    if (!hex) return;
    for (const sub of child.children) {
      if (!(sub instanceof THREE.LineSegments)) continue;
      const lineMat = sub.material;
      const edges = Array.isArray(lineMat) ? lineMat : [lineMat];
      for (const edge of edges) {
        if (edge instanceof THREE.LineBasicMaterial) edge.color.set(hex);
      }
    }
  });
}

/**
 * Nearest hit that is still shown. Three.js raycasts invisible meshes too, so a
 * hidden part would otherwise keep swallowing clicks meant for what it covers.
 */
function pickVisiblePart(
  intersections: ReadonlyArray<{ object: THREE.Object3D }>,
  hidden: Set<string>,
  allowIds: Set<string> | null,
): CadPartRef | null {
  for (const hit of intersections) {
    let node: THREE.Object3D | null = hit.object;
    while (node && node.type !== "Scene") {
      const partId = node.userData.partId as string | undefined;
      if (partId && !hidden.has(partId) && (!allowIds || allowIds.has(partId))) {
        return { partId, cadName: (node.userData.cadName as string | undefined) ?? partId };
      }
      node = node.parent;
    }
  }
  return null;
}

function useSimulationAllowSet(onlyInSimulation: boolean): Set<string> | null {
  const [scannerId] = useScannerModel();
  const catalog = usePartInspectorStore((s) => s.catalog);
  const bindings = usePartInspectorStore((s) => s.bindings);
  return useMemo(() => {
    if (!onlyInSimulation) return null;
    return new Set(listSimulationPartIds(scannerId, catalog, bindings));
  }, [bindings, catalog, onlyInSimulation, scannerId]);
}

function MagnetMotionGroup({
  exploded,
  b0Ratio,
  scale,
  rotation,
  position,
  model,
  scaleExplode,
  explodeParts = false,
  explodeRef,
  onlyInSimulation = false,
}: MagnetMotionProps) {
  const root = useRef<THREE.Group>(null);
  const prim = useRef<THREE.Group>(null);
  const press = useRef<{ x: number; y: number; button: number } | null>(null);
  const { gl } = useThree();
  const [scannerId] = useScannerModel();
  const selectPart = usePartInspectorStore((s) => s.selectPart);
  const inspectionMode = usePartInspectorStore((s) => s.inspectionMode);
  const hiddenIds = usePartInspectorStore((s) => s.hidden[scannerId]);
  const hidden = useMemo(() => new Set(hiddenIds ?? []), [hiddenIds]);
  const allowIds = useSimulationAllowSet(onlyInSimulation);
  const heavy = useCadPerfStore((s) => s.heavy);

  useLayoutEffect(() => {
    if (!prim.current) return;
    prim.current.clear();
    prim.current.add(model);
  }, [model]);

  useEffect(() => {
    const canvas = gl.domElement;
    if (!inspectionMode) canvas.style.cursor = "";
    return () => {
      canvas.style.cursor = "";
    };
  }, [gl, inspectionMode]);

  useLayoutEffect(() => {
    if (!explodeParts || !explodeRef) return;
    const { parts, distance } = explodeRef.current;
    applyExplode(parts, exploded, distance);
  }, [explodeParts, explodeRef, exploded, model]);

  useLayoutEffect(() => {
    if (!root.current) return;
    const s = scale * (scaleExplode ? 1 + exploded * 0.35 : 1);
    root.current.scale.setScalar(s);
  }, [exploded, scale, scaleExplode]);

  useFrame(() => {
    if (explodeParts && explodeRef) {
      const { parts, distance } = explodeRef.current;
      applyExplode(parts, exploded, distance);
    }
    if (!root.current) return;
    if (!heavy) {
      root.current.rotation.y = 0.01 * (b0Ratio - 1);
    }
    const s = scale * (scaleExplode ? 1 + exploded * 0.35 : 1);
    if (root.current.scale.x !== s) root.current.scale.setScalar(s);
  });

  function clientXY(event: ThreeEvent<PointerEvent>) {
    return { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY };
  }

  const pickProps = inspectionMode
    ? {
        onPointerOver: (event: ThreeEvent<PointerEvent>) => {
          if (!pickVisiblePart(event.intersections, hidden, allowIds)) return;
          gl.domElement.style.cursor = "pointer";
        },
        onPointerOut: () => {
          gl.domElement.style.cursor = "";
        },
        onClick: (event: ThreeEvent<MouseEvent>) => {
          if (event.button !== 0) return;
          const part = pickVisiblePart(event.intersections, hidden, allowIds);
          if (!part) return;
          event.stopPropagation();
          const additive =
            event.nativeEvent.shiftKey || event.nativeEvent.metaKey || event.nativeEvent.ctrlKey;
          selectPart({ ...part, scannerId }, additive ? "toggle" : "replace");
        },
        onPointerDown: (event: ThreeEvent<PointerEvent>) => {
          if (event.button !== 2) return;
          press.current = { ...clientXY(event), button: event.button };
        },
        onPointerUp: (event: ThreeEvent<PointerEvent>) => {
          if (event.button !== 2 || !press.current || press.current.button !== 2) return;
          const point = clientXY(event);
          const dx = point.x - press.current.x;
          const dy = point.y - press.current.y;
          press.current = null;
          if (dx * dx + dy * dy > PART_CLICK_PX * PART_CLICK_PX) return;
          const part = pickVisiblePart(event.intersections, hidden, allowIds);
          if (!part) return;
          selectPart({ ...part, scannerId });
        },
      }
    : undefined;

  return (
    <group ref={root} position={position} rotation={rotation} scale={scale} {...pickProps}>
      <group ref={prim} />
    </group>
  );
}

function centerBufferGeometry(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return;
  const c = new THREE.Vector3();
  box.getCenter(c);
  geometry.translate(-c.x, -c.y, -c.z);
}

const CAD_HELPER_NAME = /^(X-axis|Y-axis|Z-axis|XY-plane|XZ-plane|YZ-plane)/i;

const LOCAL_A = new THREE.Vector3();
const LOCAL_B = new THREE.Vector3();

/** Convert a world-space translation into this object's parent-local space. */
function worldDeltaToParentLocal(object: THREE.Object3D, worldDelta: THREE.Vector3): THREE.Vector3 {
  const parent = object.parent;
  if (!parent) return worldDelta.clone();
  parent.updateWorldMatrix(true, false);
  LOCAL_A.set(0, 0, 0);
  parent.localToWorld(LOCAL_A);
  LOCAL_B.copy(LOCAL_A).add(worldDelta);
  parent.worldToLocal(LOCAL_A);
  parent.worldToLocal(LOCAL_B);
  return LOCAL_B.sub(LOCAL_A).clone();
}

/**
 * Move a wrapper, not the GLTF node. Many CAD exporters leave node.matrix as
 * the source of truth with matrixAutoUpdate = false, so writing .position does nothing.
 */
function wrapExplodeHandle(object: THREE.Object3D): THREE.Group {
  const parent = object.parent;
  const handle = new THREE.Group();
  handle.name = `${object.name || "part"}__explode`;
  handle.matrixAutoUpdate = true;
  handle.userData.partId = object.userData.partId;
  handle.userData.cadName = object.userData.cadName;
  if (!parent) {
    handle.add(object);
    return handle;
  }
  parent.add(handle);
  handle.attach(object);
  return handle;
}

function visibleChildren(node: THREE.Object3D): THREE.Object3D[] {
  return node.children.filter((child) => child.visible && !CAD_HELPER_NAME.test(child.name));
}

function indexedBoundingBox(geometry: THREE.BufferGeometry): THREE.Box3 {
  const box = new THREE.Box3();
  const pos = geometry.getAttribute("position");
  if (!pos) return box;
  const index = geometry.getIndex();
  if (!index) {
    geometry.computeBoundingBox();
    return geometry.boundingBox?.clone() ?? box;
  }
  const arr = pos.array;
  const idx = index.array;
  const itemSize = pos.itemSize;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < idx.length; i += 1) {
    const vi = Number(idx[i]) * itemSize;
    const x = arr[vi];
    const y = arr[vi + 1];
    const z = arr[vi + 2];
    if (x < min.x) min.x = x;
    if (y < min.y) min.y = y;
    if (z < min.z) min.z = z;
    if (x > max.x) max.x = x;
    if (y > max.y) max.y = y;
    if (z > max.z) max.z = z;
  }
  if (!Number.isFinite(min.x)) return box;
  box.set(min, max);
  geometry.boundingBox = box.clone();
  return box;
}

function objectWorldBox(object: THREE.Object3D): THREE.Box3 {
  if (object instanceof THREE.Mesh) {
    const local = indexedBoundingBox(object.geometry);
    if (!local.isEmpty()) {
      object.updateWorldMatrix(true, false);
      return local.clone().applyMatrix4(object.matrixWorld);
    }
  }
  return new THREE.Box3().setFromObject(object);
}

function hideCadHelpers(root: THREE.Object3D) {
  root.traverse((child) => {
    if (CAD_HELPER_NAME.test(child.name)) child.visible = false;
  });
}

/** Prefer the SolidWorks `assembly` node; drop Blender empties and duplicate copies. */
function isolateCadRoot(scene: THREE.Object3D): THREE.Group {
  const assembly = scene.getObjectByName("assembly");
  const root = new THREE.Group();
  root.name = "cad-root";
  if (assembly) {
    root.add(assembly);
  } else {
    root.add(scene);
    hideCadHelpers(root);
  }
  const box = new THREE.Box3().setFromObject(root);
  const c = new THREE.Vector3();
  box.getCenter(c);
  root.position.sub(c);
  return root;
}

const MAX_EXPLODE_PARTS = 64;

/**
 * CAD exporters often bake one Mesh with several geometry.groups / materials.
 * Split those into sibling meshes that share vertex buffers so explode can move them.
 */
function detachGeometryGroups(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });
  for (const mesh of meshes) {
    const groups = mesh.geometry.groups;
    const index = mesh.geometry.getIndex();
    if (!index || groups.length < 2) continue;
    const parent = mesh.parent;
    if (!parent) continue;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (let i = 0; i < groups.length; i += 1) {
      const group = groups[i];
      if (!group || group.count <= 0) continue;
      const partGeo = new THREE.BufferGeometry();
      for (const name of Object.keys(mesh.geometry.attributes)) {
        partGeo.setAttribute(name, mesh.geometry.getAttribute(name));
      }
      const src = index.array;
      const slice = src.slice(group.start, group.start + group.count);
      partGeo.setIndex(new THREE.BufferAttribute(slice, 1));
      indexedBoundingBox(partGeo);
      const mat = mats[group.materialIndex ?? 0] ?? mats[0];
      const part = new THREE.Mesh(partGeo, mat);
      part.name = `${mesh.name || "part"}-${i + 1}`;
      part.position.copy(mesh.position);
      part.quaternion.copy(mesh.quaternion);
      part.scale.copy(mesh.scale);
      part.castShadow = mesh.castShadow;
      part.receiveShadow = mesh.receiveShadow;
      part.frustumCulled = true;
      parent.add(part);
    }
    parent.remove(mesh);
  }
}

function partsFromObjects(objects: THREE.Object3D[], root: THREE.Object3D): { parts: ExplodePart[]; distance: number } {
  root.updateWorldMatrix(true, true);
  const assemblyBox = new THREE.Box3().setFromObject(root);
  const ac = assemblyBox.getCenter(new THREE.Vector3());
  const size = assemblyBox.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 1e-6);
  const distance = span * 1.15;
  const minSpan = span * 0.008;

  const ranked = objects.map((object) => {
    const box = objectWorldBox(object);
    const partSize = box.getSize(new THREE.Vector3());
    return {
      object,
      span: Math.max(partSize.x, partSize.y, partSize.z),
      center: box.getCenter(new THREE.Vector3()),
    };
  });
  ranked.sort((a, b) => b.span - a.span);
  let chosen = ranked.filter((row) => row.span >= minSpan).slice(0, MAX_EXPLODE_PARTS);
  if (chosen.length < 2) chosen = ranked.slice(0, Math.min(MAX_EXPLODE_PARTS, ranked.length));

  const cluster = span * 0.03;
  const parts: ExplodePart[] = chosen.map((row, index) => {
    const dirWorld = row.center.clone().sub(ac);
    if (dirWorld.length() < cluster) {
      const angle = (2 * Math.PI * index) / Math.max(chosen.length, 1);
      dirWorld.set(Math.cos(angle), 0.12, Math.sin(angle));
    }
    dirWorld.normalize().multiplyScalar(distance);
    const handle = wrapExplodeHandle(row.object);
    const localDelta = worldDeltaToParentLocal(handle, dirWorld);
    if (localDelta.lengthSq() < 1e-16) localDelta.copy(dirWorld);
    return {
      object: handle,
      restLocal: handle.position.clone(),
      localDelta,
    };
  });
  return { parts, distance };
}

function collectExplodeTargets(root: THREE.Object3D): THREE.Object3D[] {
  detachGeometryGroups(root);
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.visible) meshes.push(obj);
  });
  return meshes;
}

function applyExplode(parts: ExplodePart[], exploded: number, _distance: number) {
  for (const part of parts) {
    part.object.position.copy(part.restLocal).addScaledVector(part.localDelta, exploded);
    part.object.updateMatrix();
    part.object.matrixWorldNeedsUpdate = true;
  }
}

function meshStats(root: THREE.Object3D): { meshes: number; triangles: number } {
  let meshes = 0;
  let triangles = 0;
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    meshes += 1;
    const index = child.geometry.getIndex();
    const positions = child.geometry.getAttribute("position");
    triangles += index ? index.count / 3 : (positions?.count ?? 0) / 3;
  });
  return { meshes, triangles };
}

function addNeonEdgeOverlay(root: THREE.Object3D): THREE.LineSegments[] {
  const { meshes, triangles } = meshStats(root);
  if (meshes > 120 || triangles > 400_000) return [];
  const edges: THREE.LineSegments[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const edgeGeometry = new THREE.EdgesGeometry(child.geometry, 20);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: CAD_EDGE_COLOR.clone(),
      transparent: true,
      opacity: 0.9,
      depthTest: true,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    lines.renderOrder = 4;
    lines.visible = false;
    lines.raycast = () => {};
    child.add(lines);
    edges.push(lines);
  });
  return edges;
}

function MagnetFromSTL({
  url,
  exploded,
  b0Ratio,
  magnetTempC,
  scale,
  rotation,
  position,
  wireframe,
  hybridRender,
  showTemperatureMap,
  useModelColors,
  polishedFinish = false,
  onlyInSimulation = false,
}: {
  url: string;
  exploded: number;
  b0Ratio: number;
  magnetTempC: number;
  scale: number;
  rotation: [number, number, number];
  position: [number, number, number];
  wireframe: boolean;
  hybridRender: boolean;
  showTemperatureMap: boolean;
  useModelColors: boolean;
  polishedFinish?: boolean;
  onlyInSimulation?: boolean;
}) {
  const src = useLoader(STLLoader, url);
  const material = useMemo(
    () => {
      const mat = new THREE.MeshStandardMaterial({
        color: CAD_TECH_COLOR.clone(),
        emissive: CAD_TECH_EMISSIVE.clone(),
        emissiveIntensity: 0.2,
        metalness: 0.58,
        roughness: 0.3,
        side: THREE.DoubleSide,
      });
      ensureThermalShader(mat);
      snapshotCadMaterial(mat);
      return mat;
    },
    [],
  );
  const object = useMemo(() => {
    const srcGeometry = src.clone();
    const mergedGeometry = mergeVertices(srcGeometry, 1e-4);
    mergedGeometry.computeVertexNormals();
    centerBufferGeometry(mergedGeometry);
    const mesh = new THREE.Mesh(mergedGeometry, material);
    const root = new THREE.Group();
    root.add(mesh);
    tagSelectableParts(root, "Magnet");
    return root;
  }, [src, material]);
  const selectedPartIds = usePartInspectorStore((s) => s.selection);
  const selectedIdSet = useMemo(
    () => new Set(selectedPartIds.map((part) => part.partId)),
    [selectedPartIds],
  );
  const [scannerId] = useScannerModel();
  const scannerBindings = usePartInspectorStore((s) => s.bindings[scannerId]);
  const setPartCatalog = usePartInspectorStore((s) => s.setPartCatalog);
  const hiddenIds = usePartInspectorStore((s) => s.hidden[scannerId]);
  const hidden = useMemo(() => new Set(hiddenIds ?? []), [hiddenIds]);
  const allowIds = useSimulationAllowSet(onlyInSimulation);
  const edgeOverlayRef = useRef<THREE.LineSegments[]>([]);
  const partRootsRef = useRef<PartRootMap>(new Map());
  usePartFocus(scannerId, partRootsRef);

  useLayoutEffect(() => {
    edgeOverlayRef.current = addNeonEdgeOverlay(object);
  }, [object]);

  useLayoutEffect(() => {
    partRootsRef.current = collectPartRoots(object);
    setPartCatalog(scannerId, collectTaggedParts(object));
  }, [object, scannerId, setPartCatalog]);

  useFrame(({ clock }) => {
    const tempT = THREE.MathUtils.clamp((magnetTempC - 24) / 20, 0, 1);
    const renderMode: "solid" | "wireframe" | "hybrid" = hybridRender
      ? "hybrid"
      : wireframe
        ? "wireframe"
        : "solid";
    const sparkle = 0.92 + 0.08 * Math.sin(clock.elapsedTime * 2.6);
    if (renderMode === "wireframe") {
      applyCadWireframeLook(material, sparkle, showTemperatureMap);
    } else {
      applyCadDisplayLook(material, useModelColors, renderMode === "hybrid", polishedFinish);
    }
    for (const edge of edgeOverlayRef.current) {
      edge.visible = renderMode !== "solid";
      if (edge.visible) {
        const m = edge.material as THREE.LineBasicMaterial;
        m.opacity = 0.72 + 0.24 * sparkle;
        m.color.copy(CAD_EDGE_COLOR);
      }
    }
    const uniforms = material.userData.thermalUniforms as ThermalUniforms | undefined;
    if (uniforms) {
      uniforms.uThermal.value = tempT;
      uniforms.uTime.value = clock.elapsedTime;
      uniforms.uHeatEnabled.value = showTemperatureMap ? (renderMode === "wireframe" ? 0.85 : 0.65) : 0;
    }
    applyPartAppearance(object, scannerBindings, selectedIdSet, renderMode === "wireframe");
    applyPartVisibility(partRootsRef.current, hidden, allowIds, object);
  });

  return (
    <MagnetMotionGroup
      exploded={exploded}
      b0Ratio={b0Ratio}
      scale={scale}
      rotation={rotation}
      position={position}
      model={object}
      scaleExplode
      onlyInSimulation={onlyInSimulation}
    />
  );
}

function MagnetFromGLTF({
  url,
  exploded,
  b0Ratio,
  magnetTempC,
  scale,
  rotation,
  position,
  wireframe,
  hybridRender,
  showTemperatureMap,
  explodeParts,
  useModelColors,
  polishedFinish = false,
  refineUnlitMaterials,
  onlyInSimulation = false,
}: {
  url: string;
  exploded: number;
  b0Ratio: number;
  magnetTempC: number;
  scale: number;
  rotation: [number, number, number];
  position: [number, number, number];
  wireframe: boolean;
  hybridRender: boolean;
  showTemperatureMap: boolean;
  explodeParts: boolean;
  useModelColors: boolean;
  polishedFinish?: boolean;
  refineUnlitMaterials: boolean;
  onlyInSimulation?: boolean;
}) {
  const gltf = useGLTF(url);
  const materialsRef = useRef<Array<THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>>([]);
  const edgeOverlayRef = useRef<THREE.LineSegments[]>([]);
  const explodeRef = useRef<{ parts: ExplodePart[]; distance: number }>({ parts: [], distance: 0 });
  const setHeavy = useCadPerfStore((s) => s.setHeavy);
  const setExplodePartCount = useCadPerfStore((s) => s.setExplodePartCount);
  const object = useMemo(() => {
    const root = isolateCadRoot(gltf.scene.clone(true));
    const stats = meshStats(root);
    const heavy = stats.triangles > 250_000 || stats.meshes > 100;
    const materials: Array<THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial> = [];
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = !heavy;
      child.receiveShadow = !heavy;
      child.frustumCulled = true;
      const source = child.material;
      const cloned = (Array.isArray(source) ? source : [source]).map((mat) => mat.clone());
      child.material = Array.isArray(source) ? cloned : cloned[0];
      for (const mat of cloned) {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          if (!heavy) ensureThermalShader(mat);
          mat.side = heavy ? THREE.FrontSide : THREE.DoubleSide;
          mat.flatShading = false;
          if (mat.metalness >= 1 && !mat.metalnessMap) {
            mat.metalness = 0.08;
            mat.roughness = Math.max(mat.roughness, 0.45);
          }
          if (refineUnlitMaterials) refineUnlitCadMaterial(mat);
          snapshotCadMaterial(mat);
          materials.push(mat);
        }
      }
    });
    edgeOverlayRef.current = addNeonEdgeOverlay(root);
    materialsRef.current = materials;
    if (explodeParts) {
      const targets = collectExplodeTargets(root);
      tagSelectableParts(root, "Magnet");
      explodeRef.current = partsFromObjects(targets, root);
    } else {
      explodeRef.current = { parts: [], distance: 0 };
      tagSelectableParts(root, "Magnet");
    }
    return root;
  }, [explodeParts, gltf, refineUnlitMaterials]);
  const scaleExplode = !explodeParts || explodeRef.current.parts.length < 2;
  const selectedPartIds = usePartInspectorStore((s) => s.selection);
  const selectedIdSet = useMemo(
    () => new Set(selectedPartIds.map((part) => part.partId)),
    [selectedPartIds],
  );
  const [scannerId] = useScannerModel();
  const scannerBindings = usePartInspectorStore((s) => s.bindings[scannerId]);
  const setPartCatalog = usePartInspectorStore((s) => s.setPartCatalog);
  const hiddenIds = usePartInspectorStore((s) => s.hidden[scannerId]);
  const hidden = useMemo(() => new Set(hiddenIds ?? []), [hiddenIds]);
  const allowIds = useSimulationAllowSet(onlyInSimulation);
  const partRootsRef = useRef<PartRootMap>(new Map());
  const invalidate = useThree((state) => state.invalidate);
  usePartFocus(scannerId, partRootsRef);

  useLayoutEffect(() => {
    partRootsRef.current = collectPartRoots(object);
    setPartCatalog(scannerId, collectTaggedParts(object));
  }, [object, scannerId, setPartCatalog]);

  useLayoutEffect(() => {
    const stats = meshStats(object);
    setHeavy(stats.triangles > 250_000 || stats.meshes > 100);
    return () => setHeavy(false);
  }, [object, setHeavy]);

  useLayoutEffect(() => {
    if (!explodeParts) return;
    setExplodePartCount(explodeRef.current.parts.length);
    return () => setExplodePartCount(0);
  }, [explodeParts, object, setExplodePartCount]);

  useLayoutEffect(() => {
    if (!showTemperatureMap) return;
    for (const mat of materialsRef.current) ensureThermalShader(mat);
  }, [object, showTemperatureMap]);

  useLayoutEffect(() => {
    applyPartVisibility(partRootsRef.current, hidden, allowIds, object);
    invalidate();
  }, [allowIds, hidden, invalidate, object]);

  const tinted = useMemo(() => {
    if (!scannerBindings) return false;
    return Object.values(scannerBindings).some((binding) => isPartColorHex(binding.colorHex));
  }, [scannerBindings]);
  const heavy = useCadPerfStore((s) => s.heavy);

  useLayoutEffect(() => {
    const renderMode: "solid" | "wireframe" | "hybrid" = hybridRender
      ? "hybrid"
      : wireframe
        ? "wireframe"
        : "solid";
    if (renderMode === "solid") {
      for (const mat of materialsRef.current) {
        applyCadDisplayLook(mat, useModelColors, false, polishedFinish);
      }
    }
    if (selectedIdSet.size > 0 || tinted) {
      applyPartAppearance(object, scannerBindings, selectedIdSet, renderMode === "wireframe");
    }
  }, [hybridRender, object, polishedFinish, scannerBindings, selectedIdSet, tinted, useModelColors, wireframe]);

  useFrame(({ clock }) => {
    const animated = !heavy || hybridRender || wireframe || showTemperatureMap;
    if (!animated) return;
    const tempT = THREE.MathUtils.clamp((magnetTempC - 24) / 20, 0, 1);
    const renderMode: "solid" | "wireframe" | "hybrid" = hybridRender
      ? "hybrid"
      : wireframe
        ? "wireframe"
        : "solid";
    const sparkle = 0.92 + 0.08 * Math.sin(clock.elapsedTime * 2.6);

    for (const edge of edgeOverlayRef.current) {
      edge.visible = renderMode !== "solid";
      if (edge.visible) {
        const m = edge.material as THREE.LineBasicMaterial;
        m.opacity = 0.72 + 0.24 * sparkle;
        m.color.copy(CAD_EDGE_COLOR);
      }
    }

    for (const mat of materialsRef.current) {
      if (renderMode === "wireframe") {
        applyCadWireframeLook(mat, sparkle, showTemperatureMap);
      } else {
        applyCadDisplayLook(mat, useModelColors, renderMode === "hybrid", polishedFinish);
      }
      const uniforms = mat.userData.thermalUniforms as ThermalUniforms | undefined;
      if (uniforms) {
        uniforms.uThermal.value = tempT;
        uniforms.uTime.value = clock.elapsedTime;
        uniforms.uHeatEnabled.value = showTemperatureMap ? (renderMode === "wireframe" ? 0.85 : 0.65) : 0;
      }
    }
  });

  return (
    <MagnetMotionGroup
      exploded={exploded}
      b0Ratio={b0Ratio}
      scale={scale}
      rotation={rotation}
      position={position}
      model={object}
      scaleExplode={scaleExplode}
      explodeParts={explodeParts}
      explodeRef={explodeRef}
      onlyInSimulation={onlyInSimulation}
    />
  );
}

function cadKindFromUrl(url: string): "stl" | "gltf" {
  const clean = url.split("?")[0] ?? url;
  const ext = clean.split(".").pop()?.toLowerCase();
  return ext === "stl" ? "stl" : "gltf";
}

export function MagnetFromCADFile(props: {
  url: string;
  exploded: number;
  b0Ratio: number;
  magnetTempC: number;
  scale: number;
  rotation: [number, number, number];
  position: [number, number, number];
  wireframe: boolean;
  hybridRender: boolean;
  showTemperatureMap: boolean;
  explodeParts: boolean;
  useModelColors: boolean;
  polishedFinish?: boolean;
  refineUnlitMaterials?: boolean;
  onlyInSimulation?: boolean;
}) {
  const shared = {
    url: props.url,
    exploded: props.exploded,
    b0Ratio: props.b0Ratio,
    magnetTempC: props.magnetTempC,
    scale: props.scale,
    rotation: props.rotation,
    position: props.position,
    wireframe: props.wireframe,
    hybridRender: props.hybridRender,
    showTemperatureMap: props.showTemperatureMap,
    useModelColors: props.useModelColors,
    polishedFinish: props.polishedFinish ?? false,
    onlyInSimulation: props.onlyInSimulation ?? false,
  };
  return cadKindFromUrl(props.url) === "stl" ? (
    <MagnetFromSTL {...shared} />
  ) : (
    <MagnetFromGLTF
      {...shared}
      explodeParts
      refineUnlitMaterials={props.refineUnlitMaterials ?? false}
    />
  );
}

export function rotationFromDeg(rotationDeg: [number, number, number]): [number, number, number] {
  return [
    THREE.MathUtils.degToRad(rotationDeg[0]),
    THREE.MathUtils.degToRad(rotationDeg[1]),
    THREE.MathUtils.degToRad(rotationDeg[2]),
  ];
}

export { readMagnetCadUrl } from "./magnetCadUrl";

export function MagnetCADSuspense(props: {
  url: string;
  exploded: number;
  b0Ratio: number;
  magnetTempC: number;
  /** Final CAD scale value (profile default + persisted user override). */
  userScale: number;
  rotationDeg: [number, number, number];
  explodeParts: boolean;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  wireframe: boolean;
  hybridRender: boolean;
  showTemperatureMap: boolean;
  useModelColors: boolean;
  polishedFinish?: boolean;
  refineUnlitMaterials?: boolean;
  onlyInSimulation?: boolean;
  fallback: ReactNode;
}) {
  const scale = Math.max(props.userScale, 1e-8);
  const position: [number, number, number] = [props.offsetX, 0.345 + props.offsetY, props.offsetZ];
  return (
    <ErrorBoundary
      resetKey={props.url}
      fallback={props.fallback}
      onError={() => {
        if (isImportedModelId(readScannerModel())) setScannerModel("halbach-48");
      }}
    >
      <Suspense fallback={props.fallback}>
        <MagnetFromCADFile
          url={props.url}
          exploded={props.exploded}
          b0Ratio={props.b0Ratio}
          magnetTempC={props.magnetTempC}
          scale={scale}
          rotation={rotationFromDeg(props.rotationDeg)}
          position={position}
          wireframe={props.wireframe}
          hybridRender={props.hybridRender}
          showTemperatureMap={props.showTemperatureMap}
          explodeParts={props.explodeParts}
          useModelColors={props.useModelColors}
          polishedFinish={props.polishedFinish}
          refineUnlitMaterials={props.refineUnlitMaterials}
          onlyInSimulation={props.onlyInSimulation}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
