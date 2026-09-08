import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type CameraControlsImpl from "camera-controls";
import { useCadPerfStore } from "./cadPerf";
import { useTwinStore } from "./telemetryStore";
import { usePartInspectorStore } from "./partInspectorStore";
import { useModelColors, usePolishedFinish } from "./useModelColors";

/**
 * Heavy CAD uses `frameloop="demand"`. Orbit/dolly still need frames while the
 * pointer is down and while camera-controls damping settles.
 */
export function CadInteractionInvalidate() {
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  const heavy = useCadPerfStore((s) => s.heavy);
  const exploded = useTwinStore((s) => s.view.exploded);
  const selectedPartId = usePartInspectorStore((s) => s.selected?.partId ?? null);
  const selectionKey = usePartInspectorStore((s) => s.selection.map((part) => part.partId).join("|"));
  const inspectionMode = usePartInspectorStore((s) => s.inspectionMode);
  const [modelColors] = useModelColors();
  const [polishedFinish] = usePolishedFinish();

  useEffect(() => {
    invalidate();
  }, [exploded, inspectionMode, invalidate, modelColors, polishedFinish, selectedPartId, selectionKey]);

  useEffect(() => {
    const canvas = gl.domElement;
    const bump = () => invalidate();
    const onMove = (event: PointerEvent) => {
      if (event.buttons) bump();
    };
    canvas.addEventListener("pointerdown", bump);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", bump);
    canvas.addEventListener("wheel", bump, { passive: true });
    canvas.addEventListener("touchmove", bump, { passive: true });
    return () => {
      canvas.removeEventListener("pointerdown", bump);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", bump);
      canvas.removeEventListener("wheel", bump);
      canvas.removeEventListener("touchmove", bump);
    };
  }, [gl, invalidate]);

  useFrame((state) => {
    if (!heavy) return;
    const controls = state.controls as (CameraControlsImpl & { active?: boolean }) | undefined;
    if (controls?.active) state.invalidate();
  });

  return null;
}
