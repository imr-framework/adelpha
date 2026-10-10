import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { ADELPHA_VOID, AdelphaVoidBackground, configureAdelphaRenderer } from "../AdelphaSceneEnvironment";
import type { ShimFieldSummary, ShimMagnetPlacement } from "../mri/api";

export type ShimTrays = {
  diameter_mm: number;
  bottom_mm: number;
  top_mm: number;
};

export type ShimFieldView = "before" | "after";

type Props = {
  trays: ShimTrays;
  field?: ShimFieldSummary | null;
  view?: ShimFieldView;
  magnets?: ShimMagnetPlacement[];
  magnetSizeMm?: number[];
};

/** Same viridis stops as the gradient-coil desk, low → high. */
const VIRIDIS = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"].map((hex) => new THREE.Color(hex));

type FieldScale = {
  /** Mean of the values being shown, in mT. */
  mean: number;
  /** Half-width of the colour range about the mean, in mT. Shared by both views. */
  half: number;
};

function mean(values: number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return values.length ? sum / values.length : 0;
}

/** Robust half-width: the 98th percentile of |deviation| so a few outliers do not wash out the map. */
function robustHalf(values: number[], centre: number): number {
  const deviations = values.map((value) => Math.abs(value - centre)).sort((a, b) => a - b);
  if (deviations.length === 0) return 1e-6;
  const index = Math.min(deviations.length - 1, Math.floor(deviations.length * 0.98));
  return Math.max(deviations[index], 1e-6);
}

function viridis(t: number, target: THREE.Color): THREE.Color {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (VIRIDIS.length - 1);
  const index = Math.min(VIRIDIS.length - 2, Math.floor(scaled));
  return target.copy(VIRIDIS[index]).lerp(VIRIDIS[index + 1], scaled - index);
}

/** Soft round sprite so samples read as dots rather than squares. */
function makeDotTexture(): THREE.Texture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const radius = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - radius;
      const dy = y + 0.5 - radius;
      const distance = Math.sqrt(dx * dx + dy * dy) / radius;
      const alpha = distance >= 1 ? 0 : distance > 0.82 ? Math.round(255 * (1 - (distance - 0.82) / 0.18)) : 255;
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

export function ShimTrayView({ trays, field, view = "before", magnets = [], magnetSizeMm = [6.35, 6.35, 3.18] }: Props) {
  const values = field ? (view === "after" && field.after_mt ? field.after_mt : field.before_mt) : null;
  const scale = useMemo<FieldScale | null>(() => {
    if (!field || !values || values.length === 0) return null;
    const beforeMean = mean(field.before_mt);
    return { mean: mean(values), half: robustHalf(field.before_mt, beforeMean) };
  }, [field, values]);
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
        <TrayScene trays={trays} field={field ?? null} values={values} scale={scale} magnets={magnets} magnetSizeMm={magnetSizeMm} />
      </Canvas>
      {field && scale ? (
        <div className="coil-scale shim-scale" aria-label="Field scale">
          <span>+{scale.half.toFixed(2)} mT</span>
          <i />
          <span>−{scale.half.toFixed(2)} mT</span>
          <small>about {scale.mean.toFixed(2)} mT</small>
        </div>
      ) : null}
      <p className="coil-orbit">Drag to orbit</p>
    </div>
  );
}

function TrayScene({
  trays,
  field,
  values,
  scale,
  magnets,
  magnetSizeMm,
}: {
  trays: ShimTrays;
  field: ShimFieldSummary | null;
  values: number[] | null;
  scale: FieldScale | null;
  magnets: ShimMagnetPlacement[];
  magnetSizeMm: number[];
}) {
  const radius = trays.diameter_mm / 2000;
  const bottom = trays.bottom_mm / 1000;
  const top = trays.top_mm / 1000;
  const size = Math.max(radius * 2, Math.abs(top - bottom), 0.05);
  const center = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  return (
    <>
      <AdelphaVoidBackground color={ADELPHA_VOID} gradient />
      <ambientLight intensity={0.7} />
      <hemisphereLight color="#f4f6f8" groundColor="#14161c" intensity={0.4} />
      <directionalLight position={[0.4, 0.8, 0.6]} intensity={1.15} />
      <Tray radius={radius} z={bottom} />
      <Tray radius={radius} z={top} />
      {field && values && scale ? <FieldPoints field={field} values={values} scale={scale} /> : null}
      {magnets.map((magnet, index) => (
        <ShimPuck key={index} magnet={magnet} sizeMm={magnetSizeMm} />
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

/** Samples as round dots coloured by deviation from the mean, viridis low → high. */
function FieldPoints({ field, values, scale }: { field: ShimFieldSummary; values: number[]; scale: FieldScale }) {
  const geometry = useMemo(() => {
    const count = Math.min(field.points.length, values.length);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const [x, y, z] = field.points[i];
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      viridis(0.5 + (values[i] - scale.mean) / (2 * scale.half), color);
      color.convertSRGBToLinear();
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return buffer;
  }, [field.points, values, scale]);
  const dot = useMemo(makeDotTexture, []);
  const pointSize = useMemo(() => {
    const { x, y, z } = field.extent_mm;
    const volume = Math.max(x[1] - x[0], 1) * Math.max(y[1] - y[0], 1) * Math.max(z[1] - z[0], 1);
    const spacingMm = Math.cbrt(volume / Math.max(field.points.length, 1));
    return Math.max(spacingMm * 0.5, 1) / 1000;
  }, [field.extent_mm, field.points.length]);
  return (
    <points geometry={geometry}>
      <pointsMaterial size={pointSize} vertexColors sizeAttenuation map={dot} alphaMap={dot} alphaTest={0.4} transparent depthWrite={false} />
    </points>
  );
}

function ShimPuck({ magnet, sizeMm }: { magnet: ShimMagnetPlacement; sizeMm: number[] }) {
  const color = magnet.polarity > 0 ? "#e15b64" : "#6aa7ff";
  return (
    <mesh position={magnet.position as [number, number, number]}>
      <boxGeometry args={[sizeMm[0] / 1000, sizeMm[1] / 1000, sizeMm[2] / 1000]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.42} metalness={0.16} />
    </mesh>
  );
}

function Frame({ center, size }: { center: THREE.Vector3; size: number }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    // The tray normal is Z, so Z is up: one plate above the bore, one below.
    camera.up.set(0, 0, 1);
    camera.position.set(center.x + size * 0.98, center.y - size * 0.8, center.z + size * 0.46);
    camera.near = Math.max(size / 200, 1e-4);
    camera.far = size * 40;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [camera, center, size]);
  return <OrbitControls makeDefault enableDamping enablePan={false} target={center} minDistance={size * 0.35} maxDistance={size * 4} />;
}
