import type { ReactNode } from "react";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { isPartColorHex, usePartInspectorStore, type CadPartRef, type PartBinding } from "./partInspectorStore";
import { useScannerModel } from "./scannerModel";

const CAD_TECH_COLOR = new THREE.Color("#5f748a");
const CAD_TECH_EMISSIVE = new THREE.Color("#113047");
const CAD_SOLID_COLOR = new THREE.Color("#f2f5f8");
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
  material.side = THREE.DoubleSide;
  material.needsUpdate = true;
}

function applyCadHybridLook(material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial) {
  applyCadSolidLook(material, 0.06);
  material.metalness = 0.62;
  material.roughness = 0.24;
}

function applyCadDisplayLook(
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  useModelColors: boolean,
  hybrid: boolean,
) {
  if (useModelColors) restoreCadMaterial(material);
  else if (hybrid) applyCadHybridLook(material);
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

type MagnetMotionProps = {
  exploded: number;
  b0Ratio: number;
  scale: number;
  rotation: [number, number, number];
  position: [number, number, number];
  model: THREE.Object3D;
  /** Uniform scale-up explode. Off when the mesh explodes named parts instead. */
  scaleExplode: boolean;
};

function tagSelectableParts(root: THREE.Object3D, fallbackName: string) {
  const assembly = root.getObjectByName("assembly");
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

  if (assembly && assembly.children.length > 0) {
    assembly.children.forEach((child, index) => {
      if (!child.visible) return;
      const cadName = child.name.trim() || `Part ${index + 1}`;
      apply(child, uniqueId(child.name, index), cadName);
    });
    return;
  }

  apply(root, fallbackName, fallbackName);
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
  selectedPartId: string | null,
  wireframe: boolean,
) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const partId = child.userData.partId as string | undefined;
    if (!partId) return;
    const hex = isPartColorHex(scannerBindings?.[partId]?.colorHex)
      ? scannerBindings[partId].colorHex
      : null;
    const selected = partId === selectedPartId;
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

function MagnetMotionGroup({
  exploded,
  b0Ratio,
  scale,
  rotation,
  position,
  model,
  scaleExplode,
}: MagnetMotionProps) {
  const root = useRef<THREE.Group>(null);
  const prim = useRef<THREE.Group>(null);
  const press = useRef<{ x: number; y: number; button: number } | null>(null);
  const { gl } = useThree();
  const [scannerId] = useScannerModel();
  const selectPart = usePartInspectorStore((s) => s.selectPart);
  const inspectionMode = usePartInspectorStore((s) => s.inspectionMode);

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

  useFrame(() => {
    if (!root.current) return;
    const wobble = 0.01 * (b0Ratio - 1);
    root.current.rotation.y = wobble;
    const s = scale * (scaleExplode ? 1 + exploded * 0.08 : 1);
    root.current.scale.setScalar(s);
  });

  function clientXY(event: ThreeEvent<PointerEvent>) {
    return { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY };
  }

  return (
    <group
      ref={root}
      position={position}
      rotation={rotation}
      scale={scale}
      onPointerOver={(event) => {
        if (!inspectionMode || !event.object.userData.partId) return;
        gl.domElement.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        gl.domElement.style.cursor = "";
      }}
      onClick={(event) => {
        if (!inspectionMode || event.button !== 0) return;
        const partId = event.object.userData.partId as string | undefined;
        const cadName = (event.object.userData.cadName as string | undefined) ?? partId;
        if (!partId || !cadName) return;
        selectPart({ partId, cadName, scannerId });
      }}
      onPointerDown={(event) => {
        if (!inspectionMode || event.button !== 2) return;
        press.current = { ...clientXY(event), button: event.button };
      }}
      onPointerUp={(event) => {
        if (!inspectionMode) return;
        if (event.button !== 2 || !press.current || press.current.button !== 2) return;
        const point = clientXY(event);
        const dx = point.x - press.current.x;
        const dy = point.y - press.current.y;
        press.current = null;
        if (dx * dx + dy * dy > PART_CLICK_PX * PART_CLICK_PX) return;
        const partId = event.object.userData.partId as string | undefined;
        const cadName = (event.object.userData.cadName as string | undefined) ?? partId;
        if (!partId || !cadName) return;
        selectPart({ partId, cadName, scannerId });
      }}
    >
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

type ExplodePart = {
  object: THREE.Object3D;
  rest: THREE.Vector3;
  dir: THREE.Vector3;
};

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

function collectExplodeParts(root: THREE.Object3D): { parts: ExplodePart[]; distance: number } {
  const assembly = root.getObjectByName("assembly") ?? root;
  assembly.updateWorldMatrix(true, true);
  const assemblyBox = new THREE.Box3().setFromObject(assembly);
  const ac = assemblyBox.getCenter(new THREE.Vector3());
  const size = assemblyBox.getSize(new THREE.Vector3());
  const distance = Math.max(size.x, size.y, size.z) * 0.55;
  const parts: ExplodePart[] = [];
  for (const child of assembly.children) {
    if (!child.visible) continue;
    const box = new THREE.Box3().setFromObject(child);
    if (box.isEmpty()) continue;
    const cc = box.getCenter(new THREE.Vector3());
    const dir = cc.sub(ac);
    if (dir.lengthSq() < 1e-12) dir.set(0, 1, 0);
    else dir.normalize();
    parts.push({ object: child, rest: child.position.clone(), dir });
  }
  return { parts, distance };
}

function addNeonEdgeOverlay(root: THREE.Object3D): THREE.LineSegments[] {
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
  const selectedPartId = usePartInspectorStore((s) => s.selected?.partId ?? null);
  const [scannerId] = useScannerModel();
  const scannerBindings = usePartInspectorStore((s) => s.bindings[scannerId]);
  const setPartCatalog = usePartInspectorStore((s) => s.setPartCatalog);
  const edgeOverlayRef = useRef<THREE.LineSegments[]>([]);

  useLayoutEffect(() => {
    edgeOverlayRef.current = addNeonEdgeOverlay(object);
  }, [object]);

  useLayoutEffect(() => {
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
      applyCadDisplayLook(material, useModelColors, renderMode === "hybrid");
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
    applyPartAppearance(object, scannerBindings, selectedPartId, renderMode === "wireframe");
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
}) {
  const gltf = useGLTF(url);
  const materialsRef = useRef<Array<THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>>([]);
  const edgeOverlayRef = useRef<THREE.LineSegments[]>([]);
  const explodeRef = useRef<{ parts: ExplodePart[]; distance: number }>({ parts: [], distance: 0 });
  const object = useMemo(() => {
    const root = isolateCadRoot(gltf.scene.clone(true));
    const materials: Array<THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial> = [];
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const source = child.material;
      const cloned = (Array.isArray(source) ? source : [source]).map((mat) => mat.clone());
      child.material = Array.isArray(source) ? cloned : cloned[0];
      for (const mat of cloned) {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          ensureThermalShader(mat);
          mat.side = THREE.DoubleSide;
          if (mat.metalness >= 1 && !mat.metalnessMap) {
            mat.metalness = 0.08;
            mat.roughness = Math.max(mat.roughness, 0.45);
          }
          snapshotCadMaterial(mat);
          applyCadSolidLook(mat);
          materials.push(mat);
        }
      }
    });
    edgeOverlayRef.current = addNeonEdgeOverlay(root);
    materialsRef.current = materials;
    explodeRef.current = explodeParts ? collectExplodeParts(root) : { parts: [], distance: 0 };
    tagSelectableParts(root, "Magnet");
    return root;
  }, [gltf, explodeParts]);
  const selectedPartId = usePartInspectorStore((s) => s.selected?.partId ?? null);
  const [scannerId] = useScannerModel();
  const scannerBindings = usePartInspectorStore((s) => s.bindings[scannerId]);
  const setPartCatalog = usePartInspectorStore((s) => s.setPartCatalog);

  useLayoutEffect(() => {
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

    if (explodeParts) {
      const { parts, distance } = explodeRef.current;
      for (const part of parts) {
        part.object.position.copy(part.rest).addScaledVector(part.dir, exploded * distance);
      }
    }

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
        applyCadDisplayLook(mat, useModelColors, renderMode === "hybrid");
      }
      const uniforms = mat.userData.thermalUniforms as ThermalUniforms | undefined;
      if (uniforms) {
        uniforms.uThermal.value = tempT;
        uniforms.uTime.value = clock.elapsedTime;
        uniforms.uHeatEnabled.value = showTemperatureMap ? (renderMode === "wireframe" ? 0.85 : 0.65) : 0;
      }
    }
    applyPartAppearance(object, scannerBindings, selectedPartId, renderMode === "wireframe");
  });

  return (
    <MagnetMotionGroup
      exploded={exploded}
      b0Ratio={b0Ratio}
      scale={scale}
      rotation={rotation}
      position={position}
      model={object}
      scaleExplode={!explodeParts}
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
  };
  return cadKindFromUrl(props.url) === "stl" ? (
    <MagnetFromSTL {...shared} />
  ) : (
    <MagnetFromGLTF {...shared} explodeParts={props.explodeParts} />
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
  fallback: ReactNode;
}) {
  const scale = Math.max(props.userScale, 1e-8);
  const position: [number, number, number] = [props.offsetX, 0.345 + props.offsetY, props.offsetZ];
  return (
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
      />
    </Suspense>
  );
}
