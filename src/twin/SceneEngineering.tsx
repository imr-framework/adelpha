import { CameraControls, GizmoHelper, GizmoViewcube, PerspectiveCamera, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import CameraControlsImpl from "camera-controls";
import * as THREE from "three";
import { AdelphaSceneEnvironment, ADELPHA_VOID } from "./AdelphaSceneEnvironment";
import { MagnetCADSuspense } from "./MagnetCAD";
import { CadInteractionInvalidate } from "./CadInteractionInvalidate";
import { listSimulationPartIds, usePartInspectorStore } from "./partInspectorStore";
import { studioCadForScanner, cadExplodesParts, useScannerCatalog, useScannerModel } from "./scannerModel";
import { scaleForScannerModel, useTwinStore } from "./telemetryStore";
import { useModelColors, usePolishedFinish } from "./useModelColors";
import { useEngineeringStore, type StudioCameraPreset, type StudioNavTool } from "./engineeringStore";

const ACTION = CameraControlsImpl.ACTION;
const CAMERA_FOV_DEG = 45;
/** Match Digital Twin iso angles so both rooms share the same viewing language. */
const DEFAULT_POLAR = THREE.MathUtils.degToRad(68);
const DEFAULT_AZIMUTH = THREE.MathUtils.degToRad(42);
/** Same hover height as Digital Twin — no studio floor. */
const TWIN_HOVER_Y = 0.345;
/** Model should fill this fraction of the viewport height. */
const FRAME_FILL = 0.62;

function applyNavButtons(controls: CameraControlsImpl, tool: StudioNavTool, shiftPan: boolean) {
  const pan = tool === "pan" || shiftPan;
  controls.mouseButtons.left = pan ? ACTION.OFFSET : ACTION.ROTATE;
  controls.mouseButtons.right = ACTION.OFFSET;
  controls.mouseButtons.middle = ACTION.DOLLY;
  controls.mouseButtons.wheel = ACTION.DOLLY;
  controls.touches.one = ACTION.TOUCH_ROTATE;
  controls.touches.two = ACTION.TOUCH_DOLLY_OFFSET;
  controls.touches.three = ACTION.TOUCH_OFFSET;
}

function fitRadius(preset: StudioCameraPreset, size: [number, number, number]): number {
  const [sx, sy, sz] = size;
  switch (preset) {
    case "front":
    case "back":
      return Math.max(sx, sy) * 0.5;
    case "left":
    case "right":
      return Math.max(sz, sy) * 0.5;
    case "top":
      return Math.max(sx, sz) * 0.5;
    case "iso":
    default:
      // Half-extents, not the bounding-sphere radius — hypot() left the model too small.
      return Math.max(sy, Math.max(sx, sz) * 0.9) * 0.5;
  }
}

function distanceForFit(radius: number, fovDeg: number, fill = FRAME_FILL): number {
  const fov = THREE.MathUtils.degToRad(fovDeg);
  return Math.max(radius, 1e-4) / (Math.tan(fov / 2) * fill);
}

function cameraAt(
  preset: StudioCameraPreset,
  target: [number, number, number],
  distance: number,
): [number, number, number] {
  const [tx, ty, tz] = target;
  switch (preset) {
    case "front":
      return [tx, ty, tz + distance];
    case "back":
      return [tx, ty, tz - distance];
    case "left":
      return [tx - distance, ty, tz];
    case "right":
      return [tx + distance, ty, tz];
    case "top":
      return [tx, ty + distance, tz + Math.max(distance * 0.002, 0.0004)];
    case "iso":
    default: {
      const offset = new THREE.Vector3().setFromSpherical(
        new THREE.Spherical(distance, DEFAULT_POLAR, DEFAULT_AZIMUTH),
      );
      return [tx + offset.x, ty + offset.y, tz + offset.z];
    }
  }
}

function applyView(
  controls: CameraControlsImpl,
  camera: THREE.PerspectiveCamera,
  preset: StudioCameraPreset,
  target: [number, number, number],
  size: [number, number, number],
  animate: boolean,
) {
  const radius = Math.max(fitRadius(preset, size), 1e-4);
  const distance = distanceForFit(radius, camera.fov || CAMERA_FOV_DEG);
  const position = cameraAt(preset, target, distance);
  camera.near = Math.max(0.0008, radius * 0.008);
  camera.far = Math.max(24, radius * 90);
  camera.updateProjectionMatrix();
  controls.minDistance = Math.max(0.02, radius * 0.18);
  controls.maxDistance = Math.max(6, radius * 16);
  void controls.setLookAt(
    position[0],
    position[1],
    position[2],
    target[0],
    target[1],
    target[2],
    animate,
  );
  void controls.setFocalOffset(0, 0, 0, animate);
  void controls.zoomTo(1, animate);
}

function FrameAssembly({
  cadKey,
  children,
}: {
  cadKey: string;
  children: ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const placedKey = useRef<string>("");
  const lastLen = useRef(0);
  const stableFrames = useRef(0);
  const setFrame = useEngineeringStore((s) => s.setFrame);
  const box = useRef(new THREE.Box3());
  const size = useRef(new THREE.Vector3());
  const center = useRef(new THREE.Vector3());

  useLayoutEffect(() => {
    placedKey.current = "";
    lastLen.current = 0;
    stableFrames.current = 0;
    setFrame(null);
  }, [cadKey, setFrame]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    if (placedKey.current === cadKey) return;
    group.updateWorldMatrix(true, true);
    box.current.makeEmpty();
    let meshCount = 0;
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.visible) return;
      meshCount += 1;
      const meshBox = new THREE.Box3().setFromObject(obj);
      if (!meshBox.isEmpty()) box.current.union(meshBox);
    });
    if (box.current.isEmpty() || meshCount < 1) return;
    box.current.getSize(size.current);
    if (size.current.length() < 1e-4) return;
    const len = size.current.length();
    if (Math.abs(len - lastLen.current) > Math.max(len * 0.04, 1e-5)) {
      lastLen.current = len;
      stableFrames.current = 0;
      return;
    }
    stableFrames.current += 1;
    if (stableFrames.current < 4) return;
    box.current.getCenter(center.current);
    const radius = Math.max(size.current.length() * 0.5, 1e-4);
    setFrame({
      target: [center.current.x, center.current.y, center.current.z],
      radius,
      size: [size.current.x, size.current.y, size.current.z],
    });
    placedKey.current = cadKey;
  });

  return <group ref={groupRef}>{children}</group>;
}

export function SceneEngineering() {
  const [scannerId] = useScannerModel();
  useScannerCatalog();
  const studio = studioCadForScanner(scannerId);
  const exploded = useTwinStore((s) => s.view.exploded);
  const [preserveModelColors] = useModelColors();
  const [polishedFinish] = usePolishedFinish();
  const catalog = usePartInspectorStore((s) => s.catalog[scannerId]);
  const bindings = usePartInspectorStore((s) => s.bindings);
  const setInspectionMode = usePartInspectorStore((s) => s.setInspectionMode);
  const navTool = useEngineeringStore((s) => s.navTool);
  const cameraPreset = useEngineeringStore((s) => s.cameraPreset);
  const viewNonce = useEngineeringStore((s) => s.viewNonce);
  const fitNonce = useEngineeringStore((s) => s.fitNonce);
  const frame = useEngineeringStore((s) => s.frame);
  const setModelInfo = useEngineeringStore((s) => s.setModelInfo);
  const { gl, camera, size } = useThree();
  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const framedKey = useRef("");
  const userScale = studio.fallback ? studio.cad.scale : scaleForScannerModel(scannerId);
  const cadKey = `${studio.cad.url}:${scannerId}`;
  const simulationIds = useMemo(
    () => listSimulationPartIds(scannerId, { [scannerId]: catalog ?? [] }, bindings),
    [bindings, catalog, scannerId],
  );
  const simKey = simulationIds.join("|");
  const home = cameraAt("iso", [0, TWIN_HOVER_Y, 0], 0.55);

  useEffect(() => {
    if (studio.cad.format === "stl") return;
    useGLTF.preload(studio.cad.url);
  }, [studio.cad.format, studio.cad.url]);

  const bindControls = useCallback((controls: CameraControlsImpl | null) => {
    if (controls && controls !== controlsRef.current) {
      applyNavButtons(controls, "orbit", false);
      controls.minDistance = 0.05;
      controls.maxDistance = 16;
      controls.minPolarAngle = THREE.MathUtils.degToRad(20);
      controls.maxPolarAngle = THREE.MathUtils.degToRad(160);
      controls.draggingSmoothTime = 0.04;
      controls.smoothTime = 0.12;
    }
    controlsRef.current = controls;
  }, []);

  useEffect(() => {
    setModelInfo({
      label: studio.label,
      partCount: simulationIds.length,
      catalogCount: catalog?.length ?? 0,
      fallback: studio.fallback,
    });
  }, [catalog, setModelInfo, simulationIds.length, studio.fallback, studio.label]);

  useEffect(() => {
    setInspectionMode(navTool === "inspect");
  }, [navTool, setInspectionMode]);

  useEffect(() => {
    const canvas = gl.domElement;
    const sync = (event: { shiftKey: boolean }) => {
      const controls = controlsRef.current;
      if (!controls) return;
      applyNavButtons(controls, navTool, event.shiftKey);
    };
    const onPointer = (event: PointerEvent) => sync(event);
    const onKey = (event: KeyboardEvent) => sync(event);
    const reset = () => {
      const controls = controlsRef.current;
      if (!controls) return;
      applyNavButtons(controls, navTool, false);
    };
    canvas.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", reset);
    const controls = controlsRef.current;
    if (controls) applyNavButtons(controls, navTool, false);
    return () => {
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", reset);
    };
  }, [gl, navTool]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !frame) return;
    const persp = camera as THREE.PerspectiveCamera;
    applyView(
      controls,
      persp,
      cameraPreset,
      frame.target,
      frame.size,
      framedKey.current === cadKey,
    );
    framedKey.current = cadKey;
  }, [cadKey, camera, cameraPreset, frame, viewNonce]);

  useEffect(() => {
    const controls = controlsRef.current;
    const current = useEngineeringStore.getState().frame;
    const preset = useEngineeringStore.getState().cameraPreset;
    if (!controls || !current) return;
    const persp = camera as THREE.PerspectiveCamera;
    const radius = Math.max(fitRadius(preset, current.size), 1e-4);
    persp.near = Math.max(0.0008, radius * 0.008);
    persp.far = Math.max(24, radius * 90);
    persp.updateProjectionMatrix();
    void controls.dollyTo(distanceForFit(radius, persp.fov || CAMERA_FOV_DEG), false);
  }, [camera, size.height, size.width]);

  useEffect(() => {
    if (!fitNonce) return;
    const controls = controlsRef.current;
    if (!controls || !frame) return;
    applyView(controls, camera as THREE.PerspectiveCamera, cameraPreset, frame.target, frame.size, true);
  }, [camera, cameraPreset, fitNonce, frame]);

  return (
    <>
      <PerspectiveCamera makeDefault position={home} fov={CAMERA_FOV_DEG} near={0.002} far={80} />
      <CameraControls makeDefault ref={bindControls} />
      <CadInteractionInvalidate />

      <AdelphaSceneEnvironment background={ADELPHA_VOID} variant="twin" />

      <FrameAssembly cadKey={`${cadKey}:${simKey}`}>
        <MagnetCADSuspense
          key={cadKey}
          url={studio.cad.url}
          exploded={exploded}
          b0Ratio={1}
          magnetTempC={24}
          userScale={userScale}
          rotationDeg={studio.cad.rotationDeg}
          explodeParts={cadExplodesParts(studio.cad)}
          offsetX={0}
          offsetY={0}
          offsetZ={0}
          wireframe={false}
          hybridRender={false}
          showTemperatureMap={false}
          useModelColors={preserveModelColors}
          polishedFinish={polishedFinish}
          refineUnlitMaterials
          onlyInSimulation
          fallback={null}
        />
      </FrameAssembly>

      <GizmoHelper
        alignment="top-right"
        margin={[72, 72]}
        onTarget={() => {
          const current = useEngineeringStore.getState().frame;
          return current
            ? new THREE.Vector3(current.target[0], current.target[1], current.target[2])
            : new THREE.Vector3(0, TWIN_HOVER_Y, 0);
        }}
      >
        <GizmoViewcube
          font="600 18px Geist Variable, Geist, Arial, sans-serif"
          color="#5c6370"
          hoverColor="#8260fb"
          textColor="#f7f8fa"
          strokeColor="#12141a"
          opacity={1}
        />
      </GizmoHelper>
    </>
  );
}
