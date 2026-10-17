import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import "./cameraInputSelector.css";
import { useCameraInputStore } from "./cameraInputStore";

export function cameraConstraints(deviceId: string, targetHz = 30): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: targetHz },
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
  };
}

export function CameraInputSelector({ deviceId, refreshKey, onChange, onRetry }: {
  deviceId: string; refreshKey: number; onChange: (id: string) => void; onRetry: () => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const media = navigator.mediaDevices;
    let cancelled = false;
    async function update() {
      const request = ++generation.current;
      try {
        if (!media?.enumerateDevices) throw new Error("Camera selection is unavailable in this browser.");
        const all = await media.enumerateDevices();
        if (cancelled || request !== generation.current) return;
        setDevices(all.filter(device => device.kind === "videoinput" && device.deviceId));
        setError("");
      } catch {
        if (!cancelled && request === generation.current) setError("Could not list cameras. Allow camera access, then refresh.");
      }
    }
    void update();
    media?.addEventListener?.("devicechange", update);
    return () => { cancelled = true; media?.removeEventListener?.("devicechange", update); };
  }, [refreshKey, refresh]);
  const missing = deviceId && !devices.some(device => device.deviceId === deviceId);
  return <div className="camera-input-controls">
    <label>Camera<select aria-label="Camera" value={deviceId} onChange={event => onChange(event.target.value)}>
      <option value="">System default camera</option>
      {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
      {missing && <option value={deviceId}>Selected camera unavailable</option>}
    </select></label>
    <button type="button" onClick={() => setRefresh(value => value + 1)} title="Refresh camera list"><RefreshCw size={14} aria-hidden /> Refresh</button>
    <button type="button" onClick={onRetry}>Reconnect</button>
    <span role="status">{error || (missing ? "Reconnect the selected camera or choose another." : "For your USB phone, choose Camo Camera. Keep Camo Studio open.")}</span>
  </div>;
}

/** Retry format negotiation only, always preserving an explicitly selected camera. */
export async function openCamera(deviceId: string, targetHz = 30): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId, targetHz));
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
    const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
    if (name !== "OverconstrainedError" && !/invalid constraint/i.test(message)) throw error;
    return navigator.mediaDevices.getUserMedia({ audio: false, video: deviceId ? { deviceId: { exact: deviceId } } : true });
  }
}

export function CameraSettings() {
  const { deviceId, refreshKey, restart, targetHz, setTargetHz } = useCameraInputStore();
  return <>
    <CameraInputSelector deviceId={deviceId} refreshKey={refreshKey} onChange={restart} onRetry={() => restart(deviceId)} />
    <div className="camera-input-controls">
      <label>Measurement target<select aria-label="Measurement target" value={targetHz} onChange={event => setTargetHz(Number(event.target.value) as 15 | 30 | 60)}>
        <option value={15}>15 measurements/s</option>
        <option value={30}>30 measurements/s</option>
        <option value={60}>60 measurements/s</option>
      </select></label>
      <span>Actual rate depends on camera frames and processing speed. Changing the target pauses recording. The HUD shows measured throughput.</span>
    </div>
  </>;
}
