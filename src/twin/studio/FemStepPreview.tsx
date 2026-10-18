import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Mesh, type Group } from "three";

export default function FemStepPreview({ file }: { file: File | null }) {
  const [model, setModel] = useState<Group | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let object: Group | null = null;
    const dispose = (root: Group) => root.traverse(child => {
      if (child instanceof Mesh) { child.geometry.dispose(); (Array.isArray(child.material) ? child.material : [child.material]).forEach(material => material.dispose()); }
    });
    setModel(null); setError("");
    if (file) void (async () => {
      try {
        // Loading the desk must not load the CAD converter. Import failures
        // belong to this optional preview, not the application root.
        const { stepFileToGlbBlob } = await import("../stepToGlb");
        if (cancelled) return;
        const blob = await stepFileToGlbBlob(file);
        const gltf = await new GLTFLoader().parseAsync(await blob.arrayBuffer(), "");
        if (cancelled) { dispose(gltf.scene); return; }
        object = gltf.scene; setModel(object);
      } catch { if (!cancelled) setError("Preview unavailable. The solver checks geometry independently."); }
    })();
    return () => { cancelled = true; if (object) dispose(object); };
  }, [file]);
  if (!model) return <div className="fem-preview-empty">{error || (file ? "Loading STEP preview…" : "Choose a STEP file to preview its geometry.")}</div>;
  return <Canvas camera={{ position: [1, 1, 1], near: .00001, far: 10000 }}>
    <ambientLight intensity={1.3} /><directionalLight position={[2, 3, 4]} intensity={2} />
    <Bounds fit clip observe margin={1.4}><primitive object={model} /></Bounds><OrbitControls makeDefault />
  </Canvas>;
}
