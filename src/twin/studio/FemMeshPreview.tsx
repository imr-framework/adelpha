import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Canvas } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import { BufferGeometry, Float32BufferAttribute, DoubleSide } from "three";
import { fetchFemMesh, type FemMeshPreview } from "../mri/api";
const colors = ["#94a3b8", "#9b87f5", "#5dd9b4", "#edb968", "#71b8ef"];

function MeshBodies({ data, air, wireframe }: { data: Extract<FemMeshPreview, { available: true }>; air: boolean; wireframe: boolean }) {
  const geometries = useMemo(() => {
    const position = new Float32BufferAttribute(data.vertices, 3);
    return data.groups.map(group => {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", position);
      geometry.setIndex(group.triangles);
      // Bounds must include only this body's referenced nodes, not every region.
      const compact = geometry.toNonIndexed();
      geometry.dispose();
      return { ...group, geometry: compact };
    });
  }, [data]);
  useEffect(() => () => geometries.forEach(group => group.geometry.dispose()), [geometries]);
  return <>{geometries.filter(group => air || group.name !== "air").map(group => <mesh key={group.id} geometry={group.geometry}>
    <meshBasicMaterial color={colors[(group.id - 1) % colors.length]} wireframe={wireframe} side={DoubleSide} transparent={group.name === "air"} opacity={group.name === "air" ? .15 : 1} depthWrite={group.name !== "air"} />
  </mesh>)}</>;
}

export default function FemMeshPreview({ jobId, controlsHost }: { jobId: string; controlsHost?: HTMLElement | null }) {
  const [data, setData] = useState<FemMeshPreview | null>(null);
  const [error, setError] = useState("");
  const [air, setAir] = useState(false);
  const [wireframe, setWireframe] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setData(null); setError("");
    fetchFemMesh(jobId).then(value => { if (!cancelled) setData(value); }).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [jobId, attempt]);
  if (error) return <div className="fem-preview-empty" role="alert">{error}<button type="button" onClick={() => setAttempt(a => a + 1)}>Retry mesh preview</button></div>;
  if (!data) return <div className="fem-preview-empty" role="status">Loading mesh…</div>;
  if (!data.available) return <div className="fem-preview-empty" role="status">{data.reason}</div>;
  const controls = (
    <div className="fem-mesh-controls">
      <label><input type="checkbox" checked={air} onChange={e => setAir(e.target.checked)} /> Show air domain</label>
      <label><input type="checkbox" checked={wireframe} onChange={e => setWireframe(e.target.checked)} /> Wireframe</label>
      <span>Surface triangles of the generated volume mesh · drag to rotate, scroll to zoom</span>
      <span>{data.groups.filter(g => air || g.name !== "air").map(g => `${g.name}: ${(g.triangles.length / 3).toLocaleString()}`).join(" · ")}</span>
    </div>
  );
  return <>
    <Canvas key={`${jobId}-${air}`} camera={{ position: [1, 1, 1], near: .00001, far: 10000 }}>
      <Bounds fit clip observe margin={1.4}><MeshBodies data={data} air={air} wireframe={wireframe} /></Bounds><OrbitControls makeDefault />
    </Canvas>
    {controlsHost ? createPortal(controls, controlsHost) : controls}
  </>;
}
