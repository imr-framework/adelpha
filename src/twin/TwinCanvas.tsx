import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { SceneTwin } from "./SceneTwin";
import { useViewportBg } from "./viewportBg";
import { configureAdelphaRenderer } from "./AdelphaSceneEnvironment";
import { useCadPerfStore } from "./cadPerf";
import { useTwinStore } from "./telemetryStore";
import { usePartInspectorStore } from "./partInspectorStore";

/** Isolated so Three.js is not in the initial Electron/JS parse. */
export function TwinCanvas({ active = true }: { active?: boolean }) {
  const [viewportBg] = useViewportBg();
  const heavy = useCadPerfStore((s) => s.heavy);
  const exploding = useTwinStore((s) => s.view.exploded > 0.001);
  const inspecting = usePartInspectorStore((s) => s.inspectionMode);
  const frameloop = !active ? "never" : heavy && !exploding && !inspecting ? "demand" : "always";
  return (
    <Canvas
      shadows={!heavy}
      frameloop={frameloop}
      dpr={heavy ? [1, 1] : [1, 1.5]}
      style={{ background: viewportBg }}
      onContextMenu={(event) => event.preventDefault()}
      onCreated={({ gl }) => configureAdelphaRenderer(gl)}
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
