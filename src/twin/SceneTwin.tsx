import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { MagnetCADSuspense } from "./MagnetCAD";
import { cadForScanner, useScannerModel } from "./scannerModel";
import { useTwinStore } from "./telemetryStore";
import { useViewportBg } from "./viewportBg";
import { useModelColors } from "./useModelColors";

const DEFAULT_CAMERA_POSITION: [number, number, number] = [0.0072, 0.4805, -0.0058];
const DEFAULT_CAMERA_TARGET: [number, number, number] = [0.0072, 0.3409, -0.0054];
const LOCKED_POLAR_ANGLE = Math.PI / 2;

export function SceneTwin() {
  const telemetry = useTwinStore((s) => s.telemetry);
  const view = useTwinStore((s) => s.view);
  const setCameraPose = useTwinStore((s) => s.setCameraPose);
  const [scannerId] = useScannerModel();
  const [viewportBg] = useViewportBg();
  const [preserveModelColors] = useModelColors();
  const cad = cadForScanner(scannerId);
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const lastPose = useRef<string>("");
  const orbitTarget: [number, number, number] = DEFAULT_CAMERA_TARGET;

  const b0Ratio = telemetry.b0_mT / Math.max(telemetry.b0_setpoint_mT, 1e-6);

  useFrame(() => {
    const target = controlsRef.current?.target ?? new THREE.Vector3(0, 0, 0);
    const distance = camera.position.distanceTo(target);
    const pose = {
      position: [camera.position.x, camera.position.y, camera.position.z] as [number, number, number],
      target: [target.x, target.y, target.z] as [number, number, number],
      distance,
    };
    // Avoid store updates every frame when values are effectively unchanged.
    const key = `${pose.position.map((v) => v.toFixed(4)).join(",")}|${pose.target
      .map((v) => v.toFixed(4))
      .join(",")}|${distance.toFixed(4)}`;
    if (key === lastPose.current) return;
    lastPose.current = key;
    setCameraPose(pose);
  });

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={DEFAULT_CAMERA_POSITION}
        fov={45}
        near={0.0001}
        far={100000}
      />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        minPolarAngle={LOCKED_POLAR_ANGLE}
        maxPolarAngle={LOCKED_POLAR_ANGLE}
        minDistance={0.001}
        target={orbitTarget}
      />

      <color key={viewportBg} attach="background" args={[viewportBg]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} castShadow />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} />

      {cad ? (
        <MagnetCADSuspense
          key={cad.url}
          url={cad.url}
          exploded={view.exploded}
          b0Ratio={b0Ratio}
          magnetTempC={telemetry.magnet_temp_C}
          userScale={view.magnet_cad_scale}
          rotationDeg={cad.rotationDeg}
          explodeParts={cad.explodeParts}
          offsetX={0}
          offsetY={0}
          offsetZ={0}
          wireframe={view.wireframe}
          hybridRender={view.hybrid_render}
          showTemperatureMap={view.show_temperature_map}
          useModelColors={preserveModelColors}
          fallback={null}
        />
      ) : null}
    </>
  );
}
