import type { ReactNode } from "react";
import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const CAD_TECH_COLOR = new THREE.Color("#5f748a");
const CAD_TECH_EMISSIVE = new THREE.Color("#113047");
const CAD_SOLID_COLOR = new THREE.Color("#f2f5f8");
const CAD_WIREFRAME_COLOR = new THREE.Color("#cfefff");
const CAD_WIREFRAME_EMISSIVE = new THREE.Color("#8dd8ff");
const CAD_EDGE_COLOR = new THREE.Color("#e3f6ff");

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
};

function MagnetMotionGroup({
  exploded,
  b0Ratio,
  scale,
  rotation,
  position,
  model,
}: MagnetMotionProps) {
  const root = useRef<THREE.Group>(null);
  const prim = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    if (!prim.current) return;
    prim.current.clear();
    prim.current.add(model);
  }, [model]);

  useFrame(() => {
    if (!root.current) return;
    const wobble = 0.01 * (b0Ratio - 1);
    root.current.rotation.y = wobble;
    const s = scale * (1 + exploded * 0.08);
    root.current.scale.setScalar(s);
  });

  return (
    <group ref={root} position={position} rotation={rotation}>
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
    return root;
  }, [src, material]);
  const edgeOverlayRef = useRef<THREE.LineSegments[]>([]);

  useLayoutEffect(() => {
    edgeOverlayRef.current = addNeonEdgeOverlay(object);
  }, [object]);

  useFrame(({ clock }) => {
    const tempT = THREE.MathUtils.clamp((magnetTempC - 24) / 20, 0, 1);
    const renderMode: "solid" | "wireframe" | "hybrid" = hybridRender
      ? "hybrid"
      : wireframe
        ? "wireframe"
        : "solid";
    if (renderMode !== "solid") {
      const sparkle = 0.92 + 0.08 * Math.sin(clock.elapsedTime * 2.6);
      if (renderMode === "wireframe") {
        material.color.copy(CAD_WIREFRAME_COLOR);
        material.emissive.copy(CAD_WIREFRAME_EMISSIVE);
        material.emissiveIntensity = showTemperatureMap ? 0.12 : 0.48 * sparkle;
        material.metalness = 0.78;
        material.roughness = 0.18;
        material.transparent = true;
        material.opacity = 0.96;
        material.depthWrite = false;
      } else {
        material.color.copy(CAD_SOLID_COLOR);
        material.emissive.copy(CAD_TECH_EMISSIVE);
        material.emissiveIntensity = 0.06;
        material.metalness = 0.62;
        material.roughness = 0.24;
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
      }
      for (const edge of edgeOverlayRef.current) {
        edge.visible = true;
        const m = edge.material as THREE.LineBasicMaterial;
        m.opacity = 0.72 + 0.24 * sparkle;
        m.color.copy(CAD_EDGE_COLOR);
      }
    } else {
      material.color.copy(CAD_SOLID_COLOR);
      material.emissive.copy(CAD_TECH_EMISSIVE);
      material.emissiveIntensity = 0.04;
      material.metalness = 0.58;
      material.roughness = 0.3;
      material.transparent = false;
      material.opacity = 1;
      material.depthWrite = true;
      for (const edge of edgeOverlayRef.current) edge.visible = false;
    }
    material.wireframe = renderMode === "wireframe";
    const uniforms = material.userData.thermalUniforms as ThermalUniforms | undefined;
    if (uniforms) {
      uniforms.uThermal.value = tempT;
      uniforms.uTime.value = clock.elapsedTime;
      uniforms.uHeatEnabled.value = showTemperatureMap ? (renderMode === "wireframe" ? 0.85 : 0.65) : 0;
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
}) {
  const gltf = useGLTF(url);
  const materialsRef = useRef<Array<THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>>([]);
  const edgeOverlayRef = useRef<THREE.LineSegments[]>([]);
  const object = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(scene);
    const c = new THREE.Vector3();
    box.getCenter(c);
    scene.position.sub(c);
    const materials: Array<THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial> = [];
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const m = child.material;
      const mats = Array.isArray(m) ? m : [m];
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          ensureThermalShader(mat);
          mat.color.copy(CAD_SOLID_COLOR);
          mat.emissive.copy(CAD_TECH_EMISSIVE);
          mat.emissiveIntensity = 0.04;
          mat.metalness = THREE.MathUtils.clamp(mat.metalness + 0.18, 0, 1);
          mat.roughness = THREE.MathUtils.clamp(mat.roughness * 0.75, 0.08, 1);
          materials.push(mat);
        }
      }
    });
    edgeOverlayRef.current = addNeonEdgeOverlay(scene);
    materialsRef.current = materials;
    return scene;
  }, [gltf]);

  useFrame(({ clock }) => {
    const tempT = THREE.MathUtils.clamp((magnetTempC - 24) / 20, 0, 1);
    const renderMode: "solid" | "wireframe" | "hybrid" = hybridRender
      ? "hybrid"
      : wireframe
        ? "wireframe"
        : "solid";
    const sparkle = 0.92 + 0.08 * Math.sin(clock.elapsedTime * 2.6);
    for (const edge of edgeOverlayRef.current) {
      edge.visible = renderMode !== "solid";
      const m = edge.material as THREE.LineBasicMaterial;
      m.opacity = 0.72 + 0.24 * sparkle;
      m.color.copy(CAD_EDGE_COLOR);
    }
    for (const mat of materialsRef.current) {
      if (renderMode !== "solid") {
        if (renderMode === "wireframe") {
          mat.color.copy(CAD_WIREFRAME_COLOR);
          mat.emissive.copy(CAD_WIREFRAME_EMISSIVE);
          mat.emissiveIntensity = showTemperatureMap ? 0.12 : 0.48 * sparkle;
          mat.metalness = THREE.MathUtils.clamp(mat.metalness + 0.04, 0, 1);
          mat.roughness = THREE.MathUtils.clamp(mat.roughness * 0.86, 0.08, 1);
          mat.transparent = true;
          mat.opacity = 0.96;
          mat.depthWrite = false;
        } else {
          mat.color.copy(CAD_SOLID_COLOR);
          mat.emissive.copy(CAD_TECH_EMISSIVE);
          mat.emissiveIntensity = 0.06;
          mat.transparent = false;
          mat.opacity = 1;
          mat.depthWrite = true;
        }
      } else {
        mat.color.copy(CAD_SOLID_COLOR);
        mat.emissive.copy(CAD_TECH_EMISSIVE);
        mat.emissiveIntensity = 0.04;
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
      }
      mat.wireframe = renderMode === "wireframe";
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
}) {
  return props.url && cadKindFromUrl(props.url) === "stl" ? (
    <MagnetFromSTL {...props} />
  ) : (
    <MagnetFromGLTF {...props} />
  );
}

export function readCadTransformFromEnv(): {
  scale: number;
  rotation: [number, number, number];
} {
  const scale = Number(import.meta.env.VITE_MAGNET_CAD_SCALE ?? "1");
  // Default CAD orientation correction: many CAD exports are Z-up; this maps base to scene "down".
  const rx = THREE.MathUtils.degToRad(Number(import.meta.env.VITE_MAGNET_CAD_RX_DEG ?? "-90"));
  const ry = THREE.MathUtils.degToRad(Number(import.meta.env.VITE_MAGNET_CAD_RY_DEG ?? "0"));
  const rz = THREE.MathUtils.degToRad(Number(import.meta.env.VITE_MAGNET_CAD_RZ_DEG ?? "0"));
  return {
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
    rotation: [rx, ry, rz],
  };
}

export function readMagnetCadUrl(): string | undefined {
  const raw = import.meta.env.VITE_MAGNET_CAD_URL?.trim();
  if (!raw) return undefined;
  // Vite only serves static meshes from `public/` (use `/name.stl`) or full http(s) URLs — not macOS/Linux file paths.
  if (raw.startsWith("/Users") || raw.startsWith("/home/") || /^[A-Za-z]:[\\/]/.test(raw)) {
    console.warn(
      "[twin] VITE_MAGNET_CAD_URL must be a URL path (e.g. /MRI_base.stl) with the file in the public/ folder, not a filesystem path.",
    );
    return undefined;
  }
  return raw;
}

export function MagnetCADSuspense(props: {
  url: string;
  exploded: number;
  b0Ratio: number;
  magnetTempC: number;
  /** Final CAD scale value (from env default + persisted user override). */
  userScale: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  wireframe: boolean;
  hybridRender: boolean;
  showTemperatureMap: boolean;
  fallback: ReactNode;
}) {
  const { rotation } = readCadTransformFromEnv();
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
        rotation={rotation}
        position={position}
        wireframe={props.wireframe}
        hybridRender={props.hybridRender}
        showTemperatureMap={props.showTemperatureMap}
      />
    </Suspense>
  );
}
