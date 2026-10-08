import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { ADELPHA_VOID, AdelphaVoidBackground, configureAdelphaRenderer } from "../AdelphaSceneEnvironment";
import type { ShimSimulation } from "../mri/api";

export function ShimTrayView({ result }: { result: ShimSimulation }) {
  return (
    <div className="mr0-stage coil-stage" role="region" aria-label="Passive shim trays">
      <Canvas
        frameloop="always"
        dpr={[1, 1.5]}
        style={{ width: "100%", height: "100%", background: ADELPHA_VOID }}
        onContextMenu={(event) => event.preventDefault()}
        onCreated={({ gl }) => configureAdelphaRenderer(gl)}
        camera={{ fov: 32, near: 0.001, far: 20, position: [0.2, 0.16, 0.22] }}
        gl={{ antialias: true, alpha: false, stencil: false, depth: true, powerPreference: "high-performance" }}
      >
        <TrayScene result={result} />
      </Canvas>
      <p className="coil-orbit">Drag to orbit</p>
    </div>
  );
}

function TrayScene({ result }: { result: ShimSimulation }) {
  const radius = result.diameter_mm / 2000;
  const offset = result.offset_mm / 1000;
  const size = Math.max(radius * 2, offset * 2, 0.05);
  const center = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  return (
    <>
      <AdelphaVoidBackground color={ADELPHA_VOID} gradient />
      <ambientLight intensity={0.7} />
      <hemisphereLight color="#f4f6f8" groundColor="#14161c" intensity={0.4} />
      <directionalLight position={[0.4, 0.8, 0.6]} intensity={1.15} />
      <Tray radius={radius} z={offset} />
      <Tray radius={radius} z={-offset} />
      {result.magnets.map((magnet, index) => (
        <ShimPuck key={index} magnet={magnet} sizeMm={result.magnet_mm} />
      ))}
      <Frame center={center} size={size} />
    </>
  );
}

function Tray({ radius, z }: { radius: number; z: number }) {
  return (
    <mesh position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[radius, radius, Math.max(radius * 0.012, 0.001), 64]} />
      <meshStandardMaterial color="#8d93a0" roughness={0.55} metalness={0.08} transparent opacity={0.45} side={THREE.DoubleSide} />
    </mesh>
  );
}

function ShimPuck({
  magnet,
  sizeMm,
}: {
  magnet: ShimSimulation["magnets"][number];
  sizeMm: number[];
}) {
  const color = magnet.polarity > 0 ? "#e15b64" : "#6aa7ff";
  return (
    <mesh position={magnet.position}>
      <boxGeometry args={[sizeMm[0] / 1000, sizeMm[1] / 1000, sizeMm[2] / 1000]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.42} metalness={0.16} />
    </mesh>
  );
}

function Frame({ center, size }: { center: THREE.Vector3; size: number }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    camera.position.set(center.x + size * 0.9, center.y + size * 0.72, center.z + size * 1.05);
    camera.near = Math.max(size / 200, 1e-4);
    camera.far = size * 40;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [camera, center, size]);
  return <OrbitControls makeDefault enableDamping enablePan={false} target={center} minDistance={size * 0.35} maxDistance={size * 6} />;
}
