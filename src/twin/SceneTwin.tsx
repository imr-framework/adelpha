import { CameraControls, PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import CameraControlsImpl from "camera-controls";
import * as THREE from "three";
import { MagnetCADSuspense } from "./MagnetCAD";
import { clearPartSelection, resetPartView } from "./partInspectorStore";
import { cadForScanner, useScannerModel } from "./scannerModel";
import { useTwinStore } from "./telemetryStore";
import { useViewportBg } from "./viewportBg";
import { useModelColors } from "./useModelColors";
import { subscribeViewportRecenter } from "./viewportRecenter";
import { readOrbitMode, useOrbitMode, type OrbitMode } from "./orbitMode";

const MODEL_ORBIT_CENTER: [number, number, number] = [0, 0.345, 0];
const DEFAULT_POLAR = THREE.MathUtils.degToRad(68);
const DEFAULT_AZIMUTH = THREE.MathUtils.degToRad(42);
const TURNTABLE_POLAR = Math.PI / 2;
const TURNTABLE_AZIMUTH = 0;
const CAMERA_FOV_DEG = 45;
const ACTION = CameraControlsImpl.ACTION;

function framingDistance(userScale: number, explodeParts: boolean): number {
  if (explodeParts) return Math.max(0.26, userScale * 1.25);
  return 0.11;
}

function cameraPositionAt(
  polar: number,
  azimuth: number,
  distance: number,
): [number, number, number] {
  const offset = new THREE.Vector3().setFromSpherical(
    new THREE.Spherical(distance, polar, azimuth),
  );
  return [
    MODEL_ORBIT_CENTER[0] + offset.x,
    MODEL_ORBIT_CENTER[1] + offset.y,
    MODEL_ORBIT_CENTER[2] + offset.z,
  ];
}

function applyPanButtons(controls: CameraControlsImpl, panWithLeft: boolean) {
  controls.mouseButtons.left = panWithLeft ? ACTION.OFFSET : ACTION.ROTATE;
  controls.mouseButtons.right = ACTION.OFFSET;
  controls.mouseButtons.middle = ACTION.DOLLY;
  controls.mouseButtons.wheel = ACTION.DOLLY;
  controls.touches.one = ACTION.TOUCH_ROTATE;
  controls.touches.two = ACTION.TOUCH_DOLLY_OFFSET;
  controls.touches.three = ACTION.TOUCH_OFFSET;
}

function wantsLeftPan(event: { shiftKey: boolean }) {
  return event.shiftKey;
}

function applyOrbitLimits(controls: CameraControlsImpl, mode: OrbitMode, animate: boolean) {
  if (mode === "turntable") {
    controls.minPolarAngle = TURNTABLE_POLAR;
    controls.maxPolarAngle = TURNTABLE_POLAR;
    void controls.rotateTo(TURNTABLE_AZIMUTH, TURNTABLE_POLAR, animate);
    return;
  }
  controls.minPolarAngle = THREE.MathUtils.degToRad(20);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(160);
}

function applyDefaultView(
  controls: CameraControlsImpl,
  animate: boolean,
  mode: OrbitMode,
  distance: number,
) {
  const polar = mode === "turntable" ? TURNTABLE_POLAR : DEFAULT_POLAR;
  const azimuth = mode === "turntable" ? TURNTABLE_AZIMUTH : DEFAULT_AZIMUTH;
  const position = cameraPositionAt(polar, azimuth, distance);
  void controls.setLookAt(
    position[0],
    position[1],
    position[2],
    MODEL_ORBIT_CENTER[0],
    MODEL_ORBIT_CENTER[1],
    MODEL_ORBIT_CENTER[2],
    animate,
  );
  void controls.setFocalOffset(0, 0, 0, animate);
  void controls.zoomTo(1, animate);
  applyOrbitLimits(controls, mode, animate);
}

export function SceneTwin() {
  const telemetry = useTwinStore((s) => s.telemetry);
  const view = useTwinStore((s) => s.view);
  const setCameraPose = useTwinStore((s) => s.setCameraPose);
  const [scannerId] = useScannerModel();
  const [viewportBg] = useViewportBg();
  const [preserveModelColors] = useModelColors();
  const [orbitMode] = useOrbitMode();
  const cad = cadForScanner(scannerId);
  const { camera, gl } = useThree();
  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const lastPose = useRef<string>("");
  const targetScratch = useRef(new THREE.Vector3());
  const positionScratch = useRef(new THREE.Vector3());
  const distance = framingDistance(cad?.scale ?? view.magnet_cad_scale, cad?.explodeParts ?? false);
  const homePosition = cameraPositionAt(TURNTABLE_POLAR, TURNTABLE_AZIMUTH, distance);

  const bindControls = useCallback((controls: CameraControlsImpl | null) => {
    if (controls && controls !== controlsRef.current) {
      applyPanButtons(controls, false);
      controls.minDistance = 0.001;
      controls.draggingSmoothTime = 0.04;
      controls.smoothTime = 0.12;
      applyDefaultView(controls, false, readOrbitMode(), distance);
    }
    controlsRef.current = controls;
  }, [distance]);

  useEffect(() => {
    const canvas = gl.domElement;
    const syncFromKeys = (event: KeyboardEvent) => {
      const controls = controlsRef.current;
      if (!controls) return;
      applyPanButtons(controls, wantsLeftPan(event));
    };
    const syncFromPointer = (event: PointerEvent) => {
      const controls = controlsRef.current;
      if (!controls) return;
      applyPanButtons(controls, wantsLeftPan(event));
    };
    const resetLeftDrag = () => {
      const controls = controlsRef.current;
      if (!controls) return;
      applyPanButtons(controls, false);
    };
    canvas.addEventListener("pointerdown", syncFromPointer);
    window.addEventListener("keydown", syncFromKeys);
    window.addEventListener("keyup", syncFromKeys);
    window.addEventListener("blur", resetLeftDrag);
    return () => {
      canvas.removeEventListener("pointerdown", syncFromPointer);
      window.removeEventListener("keydown", syncFromKeys);
      window.removeEventListener("keyup", syncFromKeys);
      window.removeEventListener("blur", resetLeftDrag);
    };
  }, [gl]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    applyOrbitLimits(controls, orbitMode, true);
  }, [orbitMode]);

  useEffect(() => {
    resetPartView(scannerId);
  }, [cad?.url, scannerId]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    applyDefaultView(controls, false, readOrbitMode(), distance);
  }, [cad?.url, scannerId, distance]);

  useEffect(() => {
    return subscribeViewportRecenter(() => {
      clearPartSelection();
      const controls = controlsRef.current;
      if (!controls) return;
      applyDefaultView(controls, true, readOrbitMode(), distance);
    });
  }, [distance]);

  const b0Ratio = telemetry.b0_mT / Math.max(telemetry.b0_setpoint_mT, 1e-6);

  useFrame(() => {
    const controls = controlsRef.current;
    const position = controls
      ? controls.getPosition(positionScratch.current, false)
      : camera.position;
    const target = controls
      ? controls.getTarget(targetScratch.current, false)
      : targetScratch.current.set(...MODEL_ORBIT_CENTER);
    const dist = position.distanceTo(target);
    const pose = {
      position: [position.x, position.y, position.z] as [number, number, number],
      target: [target.x, target.y, target.z] as [number, number, number],
      distance: dist,
    };
    const key = `${pose.position.map((v) => v.toFixed(4)).join(",")}|${pose.target
      .map((v) => v.toFixed(4))
      .join(",")}|${dist.toFixed(4)}`;
    if (key === lastPose.current) return;
    lastPose.current = key;
    setCameraPose(pose);
  });

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={homePosition}
        fov={CAMERA_FOV_DEG}
        near={0.0001}
        far={100000}
      />
      {/* makeDefault lets MagnetCAD reach these controls to frame a part. */}
      <CameraControls makeDefault ref={bindControls} />

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
