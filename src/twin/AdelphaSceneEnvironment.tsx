import { useLayoutEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";

/** Digital Twin void — Engineering Studio uses the same black. */
export const ADELPHA_VOID = "#030303";

export function configureAdelphaRenderer(gl: THREE.WebGLRenderer) {
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1;
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
}

function makeVoidGradient() {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#0a0b0e");
  g.addColorStop(0.38, "#030303");
  g.addColorStop(1, "#010101");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Near-black backdrop. Studio uses a local vertical gradient; Twin stays a flat void. */
export function AdelphaVoidBackground({
  color,
  gradient = false,
}: {
  color: string;
  gradient?: boolean;
}) {
  const tex = useMemo(() => (gradient ? makeVoidGradient() : null), [gradient]);
  useLayoutEffect(() => {
    return () => {
      tex?.dispose();
    };
  }, [tex]);
  if (tex) return <primitive attach="background" object={tex} />;
  return <color attach="background" args={[color]} />;
}

type Variant = "twin" | "studio";

/**
 * Shared Adelpha stage: background, ambient, key, and fill.
 * Studio adds a soft hemisphere; a narrow rim belongs in the studio scene so it can track the assembly.
 */
export function AdelphaSceneEnvironment({
  background,
  variant = "twin",
  children,
}: {
  background: string;
  variant?: Variant;
  children?: ReactNode;
}) {
  const studio = variant === "studio";
  return (
    <>
      <AdelphaVoidBackground color={background} gradient={studio} />
      <ambientLight intensity={0.35} />
      {studio ? <hemisphereLight color="#d5dae2" groundColor="#08090c" intensity={0.1} /> : null}
      {!studio ? <directionalLight position={[4, 6, 3]} intensity={1.1} castShadow /> : null}
      <directionalLight position={[-3, 2, -2]} intensity={studio ? 0.32 : 0.35} />
      {children}
    </>
  );
}
