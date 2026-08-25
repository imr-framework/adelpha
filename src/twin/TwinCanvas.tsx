import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { SceneTwin } from "./SceneTwin";
import { useViewportBg } from "./viewportBg";

/** Isolated so Three.js is not in the initial Electron/JS parse. */
export function TwinCanvas() {
  const [viewportBg] = useViewportBg();
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      style={{ background: viewportBg }}
      onContextMenu={(event) => event.preventDefault()}
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
