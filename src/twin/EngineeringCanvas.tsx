import { useThemeStageBackground } from "./consoleTheme";
import { CadSelectionColor } from "./cadSelectionTheme";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { SceneEngineering } from "./SceneEngineering";
import { configureAdelphaRenderer } from "./AdelphaSceneEnvironment";
import { useCadPerfStore } from "./cadPerf";

/** Isolated so Three.js stays out of the Imaging Console / twin parse path. */
export function EngineeringCanvas() {
  const background = useThemeStageBackground();
  const heavy = useCadPerfStore((s) => s.heavy);
  return (
    <Canvas
      shadows={!heavy}
      frameloop={heavy ? "demand" : "always"}
      dpr={heavy ? [1, 1] : [1, 1.5]}
      style={{ background }}
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
        <CadSelectionColor.Provider value="#c9ccd5"><SceneEngineering /></CadSelectionColor.Provider>
      </Suspense>
    </Canvas>
  );
}
