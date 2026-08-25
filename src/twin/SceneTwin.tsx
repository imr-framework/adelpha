import { CameraControls, PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import CameraControlsImpl from "camera-controls";
import * as THREE from "three";
import { MagnetCADSuspense } from "./MagnetCAD";
import { cadForScanner, useScannerModel } from "./scannerModel";
import { useTwinStore } from "./telemetryStore";
import { useViewportBg } from "./viewportBg";
import { useModelColors } from "./useModelColors";
import { subscribeViewportRecenter } from "./viewportRecenter";
import { readOrbitMode, useOrbitMode, type OrbitMode } from "./orbitMode";

const MODEL_ORBIT_CENTER: [number, number, number] = [0, 0.345, 0];
const DEFAULT_DISTANCE = 0.42;
const DEFAULT_POLAR = THREE.MathUtils.degToRad(68);
const DEFAULT_AZIMUTH = THREE.MathUtils.degToRad(42);
const TURNTABLE_POLAR = Math.PI / 2;
const TURNTABLE_AZIMUTH = 0;

function cameraPositionAt(polar: number, azimuth: number): [number, number, number] {
  const offset = new THREE.Vector3().setFromSpherical(
    new THREE.Spherical(DEFAULT_DISTANCE, polar, azimuth),
  );
  return [
    MODEL_ORBIT_CENTER[0] + offset.x,
    MODEL_ORBIT_CENTER[1] + offset.y,
    MODEL_ORBIT_CENTER[2] + offset.z,
  ];
}

const DEFAULT_CAMERA_POSITION = cameraPositionAt(DEFAULT_POLAR, DEFAULT_AZIMUTH);
const TURNTABLE_CAMERA_POSITION = cameraPositionAt(TURNTABLE_POLAR, TURNTABLE_AZIMUTH);
const ACTION = CameraControlsImpl.ACTION;

function applyPanButtons(controls: CameraControlsImpl, panWithLeft: boolean) {
  controls.mouseButtons.left = panWithLeft ? ACTION.OFFSET : ACTION.ROTATE;
  controls.mouseButtons.right = ACTION.OFFSET;
  controls.mouseButtons.middle = ACTION.DOLLY;
  controls.mouseButtons.wheel = ACTION.DOLLY;
  controls.touches.one = ACTION.TOUCH_ROTATE;
  controls.touches.two = ACTION.TOUCH_DOLLY_OFFSET;
  controls.touches.three = ACTION.TOUCH_OFFSET;
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

function applyDefaultView(controls: CameraControlsImpl, animate: boolean, mode: OrbitMode) {
  const position = mode === "turntable" ? TURNTABLE_CAMERA_POSITION : DEFAULT_CAMERA_POSITION;
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
  const { camera } = useThree();
  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const lastPose = useRef<string>("");
  const targetScratch = useRef(new THREE.Vector3());
  const positionScratch = useRef(new THREE.Vector3());

  const bindControls = useCallback((controls: CameraControlsImpl | null) => {
    if (controls && controls !== controlsRef.current) {
      applyPanButtons(controls, false);
      controls.minDistance = 0.001;
      controls.draggingSmoothTime = 0.04;
      controls.smoothTime = 0.12;
      applyDefaultView(controls, false, readOrbitMode());
      applyOrbitLimits(controls, readOrbitMode(), false);
    }
    controlsRef.current = controls;
  }, []);

  useEffect(() => {
    const syncModifiers = (event: KeyboardEvent) => {
      const controls = controlsRef.current;
      if (!controls) return;
      applyPanButtons(controls, event.shiftKey || event.metaKey || event.ctrlKey);
    };
    window.addEventListener("keydown", syncModifiers);
    window.addEventListener("keyup", syncModifiers);
    return () => {
      window.removeEventListener("keydown", syncModifiers);
      window.removeEventListener("keyup", syncModifiers);
    };
  }, []);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    applyOrbitLimits(controls, orbitMode, true);
  }, [orbitMode]);

  useEffect(() => {
    return subscribeViewportRecenter(() => {
      const controls = controlsRef.current;
      if (!controls) return;
      applyDefaultView(controls, true, readOrbitMode());
      applyOrbitLimits(controls, readOrbitMode(), true);
    });
  }, []);

  const b0Ratio = telemetry.b0_mT / Math.max(telemetry.b0_setpoint_mT, 1e-6);

  useFrame(() => {
    const controls = controlsRef.current;
    const position = controls
      ? controls.getPosition(positionScratch.current, false)
      : camera.position;
    const target = controls
      ? controls.getTarget(targetScratch.current, false)
      : targetScratch.current.set(...MODEL_ORBIT_CENTER);
    const distance = position.distanceTo(target);
    const pose = {
      position: [position.x, position.y, position.z] as [number, number, number],
      target: [target.x, target.y, target.z] as [number, number, number],
      distance,
    };
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
      <CameraControls ref={bindControls} />

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
