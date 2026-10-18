import { useThemeStageBackground } from "../consoleTheme";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { AdelphaVoidBackground, configureAdelphaRenderer } from "../AdelphaSceneEnvironment";
import type { ShimFieldSummary, ShimMagnetPlacement } from "../mri/api";

export type ShimTrays = {
  diameter_mm: number;
  bottom_mm: number;
  top_mm: number;
};

export type ShimFieldView = "before" | "after";
export type ShimSceneMode = "3d" | "slice";
export type ShimTrayFocus = "both" | "top" | "bottom";
export type ShimFraming = "field" | "assembly";

type Props = {
  trays: ShimTrays;
  field?: ShimFieldSummary | null;
  view?: ShimFieldView;
  magnets?: ShimMagnetPlacement[];
  magnetSizeMm?: number[];
  showTrays?: boolean;
  mode?: ShimSceneMode;
  trayFocus?: ShimTrayFocus;
  framing?: ShimFraming;
  fitNonce?: number;
};

/** Same viridis stops as the gradient-coil desk, low → high. */
const VIRIDIS = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"].map((hex) => new THREE.Color(hex));

export type FieldScale = {
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

export function shimFieldScale(field: ShimFieldSummary | null | undefined, view: ShimFieldView = "before"): FieldScale | null {
  if (!field) return null;
  const values = view === "after" && field.after_mt ? field.after_mt : field.before_mt;
  if (!values.length) return null;
  const beforeMean = mean(field.before_mt);
  return { mean: mean(values), half: robustHalf(field.before_mt, beforeMean) };
}

export function shimFieldValues(field: ShimFieldSummary | null | undefined, view: ShimFieldView = "before"): number[] | null {
  if (!field) return null;
  return view === "after" && field.after_mt ? field.after_mt : field.before_mt;
}

function viridis(t: number, target: THREE.Color): THREE.Color {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (VIRIDIS.length - 1);
  const index = Math.min(VIRIDIS.length - 2, Math.floor(scaled));
  return target.copy(VIRIDIS[index]).lerp(VIRIDIS[index + 1], scaled - index);
}

function viridisHex(t: number): string {
  return `#${viridis(t, new THREE.Color()).getHexString()}`;
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

function fieldBounds(field: ShimFieldSummary) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const [x, y, z] of field.points) {
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

export function ShimTrayView({
  trays,
  field,
  view = "before",
  magnets = [],
  magnetSizeMm = [6.35, 6.35, 3.18],
  showTrays = true,
  mode = "3d",
  trayFocus = "both",
  framing = "field",
  fitNonce = 0,
}: Props) {
  const values = shimFieldValues(field, view);
  const scale = useMemo(() => shimFieldScale(field, view), [field, view]);
  if (mode === "slice") {
    return (
      <div className="mr0-stage coil-stage" role="region" aria-label="Passive shim trays">
        {field && values && scale ? <ShimSlice field={field} values={values} scale={scale} /> : <p className="ws-empty">Load a field map to inspect a slice.</p>}
      </div>
    );
  }
  const visibleMagnets =
    trayFocus === "both"
      ? magnets
      : magnets.filter((magnet) => {
          const mid = (trays.bottom_mm + trays.top_mm) / 2000;
          return trayFocus === "top" ? magnet.position[2] >= mid : magnet.position[2] < mid;
        });
  return (
    <div className="mr0-stage coil-stage" role="region" aria-label="Passive shim trays">
      <Canvas
        frameloop="always"
        dpr={[1, 1.5]}
        style={{ width: "100%", height: "100%", background: "var(--theme-stage, #111216)" }}
        onContextMenu={(event) => event.preventDefault()}
        onCreated={({ gl }) => {
          configureAdelphaRenderer(gl);
          // The scene background follows the application theme.
        }}
        camera={{ fov: 32, near: 0.001, far: 20, position: [0.2, 0.16, 0.22] }}
        gl={{ antialias: true, alpha: false, stencil: false, depth: true, powerPreference: "high-performance" }}
      >
        <TrayScene
          trays={trays}
          field={field ?? null}
          values={values}
          scale={scale}
          magnets={visibleMagnets}
          magnetSizeMm={magnetSizeMm}
          showTrays={showTrays && trayFocus === "both" ? true : showTrays}
          trayFocus={trayFocus}
          framing={framing}
          fitNonce={fitNonce}
        />
      </Canvas>
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
  showTrays,
  trayFocus,
  framing,
  fitNonce,
}: {
  trays: ShimTrays;
  field: ShimFieldSummary | null;
  values: number[] | null;
  scale: FieldScale | null;
  magnets: ShimMagnetPlacement[];
  magnetSizeMm: number[];
  showTrays: boolean;
  trayFocus: ShimTrayFocus;
  framing: ShimFraming;
  fitNonce: number;
}) {
  const background = useThemeStageBackground("#111216");
  const radius = trays.diameter_mm / 2000;
  const bottom = trays.bottom_mm / 1000;
  const top = trays.top_mm / 1000;
  const focusZ = trayFocus === "top" ? top : trayFocus === "bottom" ? bottom : 0;
  const frame = useMemo(() => {
    const assemblySize = Math.max(radius * 2, Math.abs(top - bottom), 0.05);
    const fieldFrame = field && field.points.length ? fieldBounds(field) : null;
    if (trayFocus !== "both") {
      return { center: new THREE.Vector3(0, 0, focusZ), size: Math.max(radius * 2, 0.05) };
    }
    if (framing === "field" && fieldFrame) return fieldFrame;
    return { center: new THREE.Vector3(0, 0, 0), size: assemblySize };
  }, [field, focusZ, framing, radius, top, bottom, trayFocus]);
  return (
    <>
      <AdelphaVoidBackground color={background} />
      <ambientLight intensity={0.7} />
      <hemisphereLight color="#f4f6f8" groundColor="#14161c" intensity={0.4} />
      <directionalLight position={[0.4, 0.8, 0.6]} intensity={1.15} />
      {showTrays && (trayFocus === "both" || trayFocus === "bottom") ? <Tray radius={radius} z={bottom} /> : null}
      {showTrays && (trayFocus === "both" || trayFocus === "top") ? <Tray radius={radius} z={top} /> : null}
      {field && values && scale && trayFocus === "both" ? <FieldPoints field={field} values={values} scale={scale} /> : null}
      {magnets.map((magnet, index) => (
        <ShimPuck key={index} magnet={magnet} sizeMm={magnetSizeMm} />
      ))}
      <Frame center={frame.center} size={frame.size} topDown={trayFocus !== "both"} fitNonce={fitNonce} framing={framing} trayFocus={trayFocus} />
    </>
  );
}

function Tray({ radius, z }: { radius: number; z: number }) {
  return (
    <mesh position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[radius, radius, Math.max(radius * 0.012, 0.001), 64]} />
      <meshStandardMaterial color="#b7adcb" roughness={0.55} metalness={0.08} transparent opacity={0.22} side={THREE.DoubleSide} />
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
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  const dot = useMemo(makeDotTexture, []);
  useLayoutEffect(() => () => dot.dispose(), [dot]);
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
  const color = magnet.polarity > 0 ? "#c6b2ee" : "#8d7bb8";
  return (
    <mesh position={magnet.position as [number, number, number]}>
      <boxGeometry args={[sizeMm[0] / 1000, sizeMm[1] / 1000, sizeMm[2] / 1000]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.42} metalness={0.16} />
    </mesh>
  );
}

function Frame({
  center,
  size,
  topDown,
  fitNonce,
  framing,
  trayFocus,
}: {
  center: THREE.Vector3;
  size: number;
  topDown: boolean;
  fitNonce: number;
  framing: ShimFraming;
  trayFocus: ShimTrayFocus;
}) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    camera.up.set(0, 0, 1);
    if (topDown) {
      camera.position.set(center.x, center.y - size * 0.02, center.z + size * 1.6);
    } else {
      camera.position.set(center.x + size * 0.98, center.y - size * 0.8, center.z + size * 0.46);
    }
    camera.near = Math.max(size / 200, 1e-4);
    camera.far = size * 40;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [camera, center, size, topDown, fitNonce, framing, trayFocus]);
  return <OrbitControls makeDefault enableDamping enablePan={false} target={center} minDistance={size * 0.35} maxDistance={size * 4} />;
}

type SliceSample = { x: number; y: number; value: number };

function pickAxialSlice(field: ShimFieldSummary, values: number[]) {
  const buckets = new Map<number, SliceSample[]>();
  const count = Math.min(field.points.length, values.length);
  for (let i = 0; i < count; i += 1) {
    const [x, y, z] = field.points[i];
    const key = Math.round(z * 2000) / 2;
    const bucket = buckets.get(key) ?? [];
    bucket.push({ x, y, value: values[i] });
    buckets.set(key, bucket);
  }
  let bestKey = 0;
  let best: SliceSample[] = [];
  for (const [key, samples] of buckets) {
    if (samples.length > best.length || (samples.length === best.length && Math.abs(key) < Math.abs(bestKey))) {
      best = samples;
      bestKey = key;
    }
  }
  return { zMm: bestKey, samples: best };
}

function ShimSlice({ field, values, scale }: { field: ShimFieldSummary; values: number[]; scale: FieldScale }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const slice = useMemo(() => pickAxialSlice(field, values), [field, values]);

  useEffect(() => {
    const node = canvas.current;
    const host = node?.parentElement;
    if (!node || !host || slice.samples.length === 0) return;

    const paint = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const dpr = window.devicePixelRatio || 1;
      node.width = Math.round(width * dpr);
      node.height = Math.round(height * dpr);
      const context = node.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = "#111216";
      context.fillRect(0, 0, width, height);

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const sample of slice.samples) {
        minX = Math.min(minX, sample.x);
        minY = Math.min(minY, sample.y);
        maxX = Math.max(maxX, sample.x);
        maxY = Math.max(maxY, sample.y);
      }
      const spanX = Math.max(maxX - minX, 1e-6);
      const spanY = Math.max(maxY - minY, 1e-6);
      const pad = 36;
      const scaleDraw = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
      const ox = (width - spanX * scaleDraw) / 2;
      const oy = (height - spanY * scaleDraw) / 2;
      const cell = Math.max(3, Math.min(14, (scaleDraw * spanX) / Math.sqrt(slice.samples.length) / 1.2));

      for (const sample of slice.samples) {
        const t = 0.5 + (sample.value - scale.mean) / (2 * scale.half);
        context.fillStyle = viridisHex(t);
        context.globalAlpha = 0.55 + Math.min(0.4, Math.abs(t - 0.5));
        context.fillRect(ox + (sample.x - minX) * scaleDraw - cell / 2, oy + (maxY - sample.y) * scaleDraw - cell / 2, cell, cell);
      }
      context.globalAlpha = 1;
      context.fillStyle = "#b5b5c2";
      context.font = "11px Inter, -apple-system, BlinkMacSystemFont, sans-serif";
      context.fillText(`Axial · z = ${slice.zMm.toFixed(1)} mm`, pad, height - 16);
      context.fillText(`${(spanX * 1000).toFixed(0)} mm`, width - pad - 48, height - 16);
    };

    paint();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(paint);
    observer.observe(host);
    return () => observer.disconnect();
  }, [scale, slice]);

  return <canvas ref={canvas} className="ws-slice" aria-label={`Axial slice at z = ${slice.zMm.toFixed(1)} mm`} />;
}
