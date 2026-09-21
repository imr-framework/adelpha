import { useEffect, useRef } from "react";

export function DashCameraPreview({
  stream,
  expanded = false,
}: {
  stream: MediaStream | null;
  expanded?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) {
      void el.play().catch(() => {
        /* autoplay may be blocked briefly */
      });
    }
    return () => {
      el.srcObject = null;
    };
  }, [stream]);

  return (
    <div className={expanded ? "dash-camera-preview dash-camera-preview-expanded" : "dash-camera-preview"}>
      <video ref={videoRef} className="dash-camera-video" muted playsInline autoPlay />
      {!stream ? <span className="dash-camera-waiting">Waiting for camera…</span> : null}
    </div>
  );
}
