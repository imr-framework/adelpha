import { useThemeStageBackground } from "../consoleTheme";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { AdelphaVoidBackground, configureAdelphaRenderer } from "../AdelphaSceneEnvironment";
import type { HalbachCube, HalbachPlate, HalbachRod } from "../mri/api";

const MAGNET = "#e24a4a";
const MAGNET_EMISSIVE = "#5a1212";
const PLATE = "#c9c3b8";
const STAND = "#b7b09f";
const ROD = "#8d8880";
const BORE = "#9a94a8";
const VIEW_DIR = new THREE.Vector3(1, 0.52, 0.82).normalize();
const BREATHING = 1.2;

export function HalbachLayoutView({
  cubes,
  plates = [],
  rods = [],
  innerRadiusMm,
  magnetMm,
  label,
  view = "magnets",
  showBore = true,
  resetNonce = 0,
}: {
  cubes: HalbachCube[];
  plates?: HalbachPlate[];
  rods?: HalbachRod[];
  innerRadiusMm: number;
  magnetMm: number;
  label: string;
  view?: "magnets" | "assembly";
  showBore?: boolean;
  resetNonce?: number;
}) {
  return (
    <div className="mr0-stage coil-stage" role="region" aria-label={label}>
      <Canvas
        frameloop="always"
        dpr={[1, 1.5]}
        style={{ width: "100%", height: "100%", background: "var(--theme-stage, #111216)" }}
        onContextMenu={(event) => event.preventDefault()}
        onCreated={({ gl }) => configureAdelphaRenderer(gl)}
        camera={{ fov: 32, near: 0.001, far: 20, position: [0.4, 0.28, 0.42] }}
        gl={{ antialias: true, alpha: false, stencil: false, depth: true, powerPreference: "high-performance" }}
      >
        <HalbachScene
          cubes={cubes}
          plates={plates}
          rods={rods}
          innerRadiusMm={innerRadiusMm}
          magnetMm={magnetMm}
          view={view}
          showBore={showBore}
          resetNonce={resetNonce}
        />
      </Canvas>
    </div>
  );
}

function HalbachScene({
  cubes,
  plates,
  rods,
  innerRadiusMm,
  magnetMm,
  view,
  showBore,
  resetNonce,
}: {
  cubes: HalbachCube[];
  plates: HalbachPlate[];
  rods: HalbachRod[];
  innerRadiusMm: number;
  magnetMm: number;
  view: "magnets" | "assembly";
  showBore: boolean;
  resetNonce: number;
}) {
  const background = useThemeStageBackground("#111216");
  const framed = useMemo(
    () => assemblyBounds(cubes, plates, rods, innerRadiusMm / 1000, magnetMm / 1000),
    [cubes, plates, rods, innerRadiusMm, magnetMm],
  );
  const assembly = view === "assembly";
  return (
    <>
      <AdelphaVoidBackground color={background} />
      <ambientLight intensity={0.82} />
      <hemisphereLight color="#fff4f1" groundColor="#1a1212" intensity={0.55} />
      <directionalLight position={[1.4, 1.8, 2.1]} intensity={1.35} />
      <directionalLight position={[-1.2, 0.6, -1.1]} intensity={0.55} />
      {assembly ? <AssemblyMeshes plates={plates} rods={rods} /> : showBore ? <BoreMesh radius={innerRadiusMm / 1000} length={framed.size} /> : null}
      <CubeInstances cubes={cubes} />
      <Frame center={framed.center} radius={framed.radius} resetNonce={resetNonce} />
    </>
  );
}

function CubeInstances({ cubes }: { cubes: HalbachCube[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: MAGNET,
        emissive: MAGNET_EMISSIVE,
        emissiveIntensity: 0.22,
        roughness: 0.34,
        metalness: 0.18,
      }),
    [],
  );
  useLayoutEffect(() => {
    const object = mesh.current;
    if (!object) return;
    const dummy = new THREE.Object3D();
    cubes.forEach((cube, index) => {
      dummy.position.set(cube.x, cube.y, cube.z);
      dummy.rotation.set(0, 0, cube.angle);
      dummy.scale.setScalar(cube.size);
      dummy.updateMatrix();
      object.setMatrixAt(index, dummy.matrix);
    });
    object.instanceMatrix.needsUpdate = true;
  }, [cubes]);
  useLayoutEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  if (!cubes.length) return null;
  return <instancedMesh ref={mesh} args={[geometry, material, cubes.length]} />;
}

function AssemblyMeshes({ plates, rods }: { plates: HalbachPlate[]; rods: HalbachRod[] }) {
  return (
    <>
      {plates.map((plate) => (
        <PlateMesh key={`plate-${plate.index}`} plate={plate} />
      ))}
      {rods.map((rod, index) => (
        <RodMesh key={`rod-${index}`} rod={rod} />
      ))}
    </>
  );
}

function ringShape(inner: number, outer: number) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, Math.max(inner, 1e-4), 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

function PlateMesh({ plate }: { plate: HalbachPlate }) {
  const inner = plate.inner_radius;
  const outer = plate.outer_radius;
  const height = Math.max(plate.height, 1e-4);
  const geometry = useMemo(
    () => new THREE.ExtrudeGeometry(ringShape(inner, outer), { depth: height, bevelEnabled: false, curveSegments: 48 }),
    [inner, outer, height],
  );
  const stand = useMemo(() => {
    if (plate.stand_width <= 0 || plate.stand_height <= 0) return null;
    const outline = new THREE.Shape();
    outline.moveTo(-plate.stand_width / 2, -plate.stand_height);
    outline.lineTo(plate.stand_width / 2, -plate.stand_height);
    outline.lineTo(outer, 0);
    outline.lineTo(-outer, 0);
    outline.closePath();
    return new THREE.ExtrudeGeometry(outline, { depth: height, bevelEnabled: false });
  }, [plate.stand_height, plate.stand_width, outer, height]);
  useLayoutEffect(
    () => () => {
      geometry.dispose();
      stand?.dispose();
    },
    [geometry, stand],
  );
  const z = plate.z - height / 2;
  return (
    <group position={[0, 0, z]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={PLATE} roughness={0.72} metalness={0.04} transparent opacity={0.58} depthWrite={false} />
      </mesh>
      {stand ? (
        <mesh geometry={stand}>
          <meshStandardMaterial color={STAND} roughness={0.78} metalness={0.03} transparent opacity={0.7} />
        </mesh>
      ) : null}
    </group>
  );
}

function RodMesh({ rod }: { rod: HalbachRod }) {
  const length = Math.max(rod.z1 - rod.z0, 1e-4);
  const geometry = useMemo(() => new THREE.CylinderGeometry(rod.radius, rod.radius, length, 12), [rod.radius, length]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={[rod.x, rod.y, (rod.z0 + rod.z1) / 2]} rotation={[Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color={ROD} roughness={0.45} metalness={0.28} />
    </mesh>
  );
}

function BoreMesh({ radius, length }: { radius: number; length: number }) {
  const geometry = useMemo(() => new THREE.CylinderGeometry(radius, radius, Math.max(length, 0.04), 48, 1, true), [radius, length]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color={BORE} roughness={0.62} metalness={0.04} transparent opacity={0.1} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function assemblyBounds(cubes: HalbachCube[], plates: HalbachPlate[], rods: HalbachRod[], innerRadius: number, magnetSize: number) {
  let minX = -innerRadius;
  let maxX = innerRadius;
  let minY = -innerRadius;
  let maxY = innerRadius;
  let minZ = 0;
  let maxZ = 0;
  for (const cube of cubes) {
    const pad = cube.size / 2;
    minX = Math.min(minX, cube.x - pad);
    maxX = Math.max(maxX, cube.x + pad);
    minY = Math.min(minY, cube.y - pad);
    maxY = Math.max(maxY, cube.y + pad);
    minZ = Math.min(minZ, cube.z - pad);
    maxZ = Math.max(maxZ, cube.z + pad);
  }
  for (const plate of plates) {
    maxX = Math.max(maxX, plate.outer_radius, plate.stand_width / 2);
    minX = Math.min(minX, -plate.outer_radius, -plate.stand_width / 2);
    maxY = Math.max(maxY, plate.outer_radius);
    minY = Math.min(minY, -plate.outer_radius, -plate.stand_height);
    minZ = Math.min(minZ, plate.z - plate.height / 2);
    maxZ = Math.max(maxZ, plate.z + plate.height / 2);
  }
  for (const rod of rods) {
    minZ = Math.min(minZ, rod.z0);
    maxZ = Math.max(maxZ, rod.z1);
  }
  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = Math.max(maxZ - minZ, magnetSize);
  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2] as const,
    size: Math.max(dx, dy, dz, 0.05),
    radius: Math.max(Math.hypot(dx, dy, dz) / 2, 0.025),
  };
}

function Frame({
  center,
  radius,
  resetNonce,
}: {
  center: readonly [number, number, number];
  radius: number;
  resetNonce: number;
}) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);
  const controls = useRef<{ target: THREE.Vector3; update: () => void } | null>(null);
  const lastReset = useRef(resetNonce);
  const viewDir = useRef(VIEW_DIR.clone());
  const target = useMemo(() => new THREE.Vector3(center[0], center[1], center[2]), [center]);

  useLayoutEffect(() => {
    const reset = lastReset.current !== resetNonce || viewDir.current.lengthSq() < 1e-8;
    lastReset.current = resetNonce;
    if (reset) viewDir.current.copy(VIEW_DIR);
    else {
      const current = camera.position.clone().sub(target);
      if (current.lengthSq() > 1e-8) viewDir.current.copy(current.normalize());
    }
    const width = Math.max(size.width, 1);
    const height = Math.max(size.height, 1);
    const fov = ((camera.fov ?? 32) * Math.PI) / 180;
    const padded = radius * BREATHING;
    const vertical = padded / Math.tan(fov / 2);
    const horizontal = padded / (Math.tan(fov / 2) * (width / height));
    const distance = Math.max(vertical, horizontal);
    camera.position.copy(target).addScaledVector(viewDir.current, distance);
    camera.near = Math.max(distance / 200, 1e-4);
    camera.far = Math.max(distance * 20, radius * 40);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (controls.current) {
      controls.current.target.copy(target);
      controls.current.update();
    }
  }, [camera, radius, resetNonce, size.height, size.width, target]);

  return (
    <OrbitControls
      ref={(node) => {
        controls.current = node;
      }}
      makeDefault
      enableDamping
      enablePan={false}
      target={target}
      minDistance={radius * 0.45}
      maxDistance={radius * 8}
    />
  );
}
