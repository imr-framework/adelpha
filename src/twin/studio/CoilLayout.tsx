import { useThemeStageBackground } from "../consoleTheme";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { AdelphaVoidBackground, configureAdelphaRenderer } from "../AdelphaSceneEnvironment";
import type { CoilLayout } from "../mri/api";
import { coilBounds, displayWireRadius, splitWirePoints, wireKey } from "./coilPaths";

const WINDING = "#baa6f7";
const WINDING_QUIET = "#8f7fbe";
const FORMER = "#9a94a8";
const VIEW_DIR = new THREE.Vector3(1, 0.52, 0.82).normalize();
const BREATHING = 1.15;

export function CoilLayoutView({
  layout,
  label,
  showFormer = true,
  resetNonce = 0,
}: {
  layout: CoilLayout;
  label: string;
  showFormer?: boolean;
  resetNonce?: number;
}) {
  return (
    <div className="mr0-stage coil-stage" role="region" aria-label={label}>
      <Canvas
        frameloop="always"
        dpr={[1, 1.5]}
        style={{ width: "100%", height: "100%", background: "var(--theme-stage, #111216)" }}
        onContextMenu={(event) => event.preventDefault()}
        onCreated={({ gl }) => {
          configureAdelphaRenderer(gl);
          // The scene background follows the application theme.
        }}
        camera={{ fov: 32, near: 0.001, far: 20, position: [0.4, 0.28, 0.42] }}
        gl={{ antialias: true, alpha: false, stencil: false, depth: true, powerPreference: "high-performance" }}
      >
        <CoilScene layout={layout} showFormer={showFormer} resetNonce={resetNonce} />
      </Canvas>
    </div>
  );
}

function CoilScene({ layout, showFormer, resetNonce }: { layout: CoilLayout; showFormer: boolean; resetNonce: number }) {
  const background = useThemeStageBackground("#111216");
  const [selected, setSelected] = useState<string | null>(null);
  const framed = useMemo(() => coilBounds(layout), [layout]);
  const paths = useMemo(
    () =>
      layout.wires.flatMap((wire, index) =>
        splitWirePoints(wire.points, wire.closed).map((part, partIndex) => ({
          key: `${wireKey(wire, index)}-${partIndex}`,
          points: part.points,
          closed: part.closed,
        })),
      ),
    [layout.wires],
  );
  return (
    <>
      <AdelphaVoidBackground color={background} />
      <ambientLight intensity={0.72} />
      <hemisphereLight color="#f4f6f8" groundColor="#14161c" intensity={0.42} />
      <directionalLight position={[1.4, 1.8, 2.1]} intensity={1.05} />
      <directionalLight position={[-1.6, 0.2, -1.1]} intensity={0.32} />
      {showFormer ? <CoilSurface layout={layout} /> : null}
      {paths.map((path) => (
        <WireTube
          key={path.key}
          points={path.points}
          closed={path.closed}
          radius={displayWireRadius(layout.wire_radius, path.key === selected)}
          selected={path.key === selected}
          onSelect={() => setSelected((current) => (current === path.key ? null : path.key))}
        />
      ))}
      <Frame center={framed.center} radius={framed.radius} resetNonce={resetNonce} />
    </>
  );
}

function CoilSurface({ layout }: { layout: CoilLayout }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(layout.vertices.flat(), 3));
    geo.setIndex(layout.faces.flat());
    geo.computeVertexNormals();
    return geo;
  }, [layout]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={FORMER} roughness={0.62} metalness={0.04} transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function WireTube({
  points,
  closed,
  radius,
  selected,
  onSelect,
}: {
  points: number[][];
  closed: boolean;
  radius: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const geometry = useMemo(() => {
    const path = polylineCurve(points, closed);
    if (!path) return null;
    const segments = Math.max(8, points.length * 2);
    return new THREE.TubeGeometry(path, segments, radius, 5, closed);
  }, [points, closed, radius]);
  useLayoutEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  const color = selected ? WINDING : WINDING_QUIET;
  return (
    <mesh
      geometry={geometry}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={selected ? 0.2 : 0.035}
        roughness={0.52}
        metalness={0.08}
        transparent
        opacity={selected ? 1 : 0.82}
      />
    </mesh>
  );
}

function polylineCurve(points: number[][], closed: boolean) {
  if (points.length < 2) return null;
  const path = new THREE.CurvePath<THREE.Vector3>();
  const last = closed ? points.length : points.length - 1;
  for (let index = 0; index < last; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    path.add(new THREE.LineCurve3(new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(b[0], b[1], b[2])));
  }
  return path;
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
