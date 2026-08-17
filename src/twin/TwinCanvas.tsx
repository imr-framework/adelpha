import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { SceneTwin } from "./SceneTwin";

/** Isolated so Three.js is not in the initial Electron/JS parse. */
export function TwinCanvas() {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        alpha: false,
        stencil: false,
        depth: true,
      }}
    >
      <Suspense fallback={null}>
        <SceneTwin />
      </Suspense>
    </Canvas>
  );
}
