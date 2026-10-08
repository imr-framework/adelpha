import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { ADELPHA_VOID, AdelphaVoidBackground, configureAdelphaRenderer } from "../AdelphaSceneEnvironment";
import type { CoilLayout, CoilWire } from "../mri/api";

/** Same cycle as pyCoilGen's contour plots. */
const GROUP_COLORS = ["#0000ff", "#008000", "#ff0000", "#800080", "#ffa500", "#a52a2a", "#ffc0cb", "#808080", "#00ffff", "#ff00ff"];

export function CoilLayoutView({ layout, label }: { layout: CoilLayout; label: string }) {
  return (
    <div className="mr0-stage coil-stage" role="region" aria-label={label}>
      <Canvas
        frameloop="always"
        dpr={[1, 1.5]}
        style={{ width: "100%", height: "100%", background: ADELPHA_VOID }}
        onContextMenu={(event) => event.preventDefault()}
        onCreated={({ gl }) => configureAdelphaRenderer(gl)}
        camera={{ fov: 32, near: 0.001, far: 20, position: [0.4, 0.28, 0.42] }}
        gl={{ antialias: true, alpha: false, stencil: false, depth: true, powerPreference: "high-performance" }}
      >
        <CoilScene layout={layout} />
      </Canvas>
      <div className="coil-scale" aria-label="Stream function">
        <span>{formatStream(layout.stream_max)}</span>
        <i />
        <span>{formatStream(layout.stream_min)}</span>
      </div>
      <p className="coil-orbit">Drag to orbit</p>
    </div>
  );
}

function CoilScene({ layout }: { layout: CoilLayout }) {
  const framed = useMemo(() => frame(layout.vertices), [layout]);
  return (
    <>
      <AdelphaVoidBackground color={ADELPHA_VOID} gradient />
      <ambientLight intensity={0.72} />
      <hemisphereLight color="#f4f6f8" groundColor="#14161c" intensity={0.42} />
      <directionalLight position={[1.4, 1.8, 2.1]} intensity={1.2} />
      <directionalLight position={[-1.6, 0.2, -1.1]} intensity={0.38} />
      <CoilSurface layout={layout} />
      {layout.wires.map((wire, index) => (
        <WireTube key={index} wire={wire} radius={layout.wire_radius} />
      ))}
      <Frame center={framed.center} size={framed.size} />
    </>
  );
}

function CoilSurface({ layout }: { layout: CoilLayout }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(layout.vertices.flat(), 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(linearVertexColors(layout.colors), 3));
    geo.setIndex(layout.faces.flat());
    geo.computeVertexNormals();
    return geo;
  }, [layout]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors roughness={0.58} metalness={0.02} side={THREE.DoubleSide} />
    </mesh>
  );
}

function WireTube({ wire, radius }: { wire: CoilWire; radius: number }) {
  const geometry = useMemo(() => {
    const path = wire.points.map((point) => new THREE.Vector3(point[0], point[1], point[2]));
    if (path.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(path, wire.closed, "chord");
    return new THREE.TubeGeometry(curve, Math.max(12, path.length * 2), radius, 6, wire.closed);
  }, [wire, radius]);
  useLayoutEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  const color = GROUP_COLORS[wire.group % GROUP_COLORS.length];
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.16} roughness={0.4} metalness={0.14} />
    </mesh>
  );
}

function Frame({ center, size }: { center: THREE.Vector3; size: number }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    camera.position.set(center.x + size * 1.05, center.y + size * 0.62, center.z + size * 0.95);
    camera.near = Math.max(size / 200, 1e-4);
    camera.far = size * 40;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [camera, center, size]);
  return (
    <OrbitControls
      makeDefault
      enableDamping
      enablePan={false}
      target={center}
      minDistance={size * 0.4}
      maxDistance={size * 5.5}
    />
  );
}

function frame(vertices: number[][]) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const [x, y, z] of vertices) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return {
    center: new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
    size: Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.05),
  };
}

function linearVertexColors(colors: number[][]) {
  const out = new Float32Array(colors.length * 3);
  const color = new THREE.Color();
  colors.forEach((sample, index) => {
    color.setRGB(sample[0] ?? 0, sample[1] ?? 0, sample[2] ?? 0, THREE.SRGBColorSpace);
    out[index * 3] = color.r;
    out[index * 3 + 1] = color.g;
    out[index * 3 + 2] = color.b;
  });
  return out;
}

function formatStream(value: number) {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}
