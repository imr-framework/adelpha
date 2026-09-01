import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { TwinButterfly } from "./TwinButterfly";
import {
  LAUNCH_COLORS,
  LAUNCH_COPY,
  LAUNCH_DURATION_S,
  LAUNCH_REDUCED_DURATION_S,
  markLaunchSeen,
} from "./launchConfig";
import { OverlayChrome } from "../../desktop/WindowControls";

type LaunchScreenProps = {
  onComplete: () => void;
  /** When true, stay on the wordmark after the cinematic until this becomes false. */
  hold?: boolean;
  status?: string;
};

const PARTICLE_COUNT = 10;

/** Timeline beats for a ~3.4s intro */
const APPROACH_START = 0.22;
const APPROACH_DUR = 1.0;
const MEET_AT = 1.22;
const FUSE_AT = 1.5;
const RADIATE_AT = 1.82;
const WORDMARK_AT = 1.88;
const SUBTITLE_AT = 2.38;
const HOLD_PULSE_AT = 2.75;

type FlightPoint = { x: number; y: number; rotation: number };

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * SVG butterfly faces up at rotation 0°. Map a travel/look vector to CSS degrees
 * so the head points along (dx, dy).
 */
function headingDeg(dx: number, dy: number): number {
  return (Math.atan2(dy, dx) * 180) / Math.PI + 90;
}

/**
 * Organic approach path that wanders, then settles at the center.
 * Each twin faces roughly toward the other / center the whole way.
 */
function buildApproachPath(side: "left" | "right", enterX: number): FlightPoint[] {
  const sign = side === "left" ? -1 : 1;
  const startY = rand(-36, 48);
  const points: { x: number; y: number }[] = [{ x: sign * enterX, y: startY }];

  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    // Progress toward center with leftover wander that shrinks near the end
    const progressX = sign * enterX * (1 - t);
    const wanderAmp = (1 - t) * enterX * 0.22;
    const x = progressX + rand(-wanderAmp, wanderAmp);
    // Keep generally inbound (don't overshoot past center too early)
    const inboundX = side === "left" ? Math.min(x, -8 * (1 - t)) : Math.max(x, 8 * (1 - t));
    const y = rand(-56, 56) * (1 - t * 0.55);
    points.push({ x: inboundX, y });
  }
  points.push({ x: 0, y: 0 });

  return points.map((p, i) => {
    const next = points[i + 1] ?? { x: 0, y: 0 };
    // Bias look toward center so twins face each other, with a touch of path tangent
    const toCenterX = -p.x;
    const toCenterY = -p.y;
    const pathDx = next.x - p.x;
    const pathDy = next.y - p.y;
    const lookX = toCenterX * 0.65 + pathDx * 0.35;
    const lookY = toCenterY * 0.65 + pathDy * 0.35;
    // Near the end, lock to facing each other horizontally
    const face =
      i >= points.length - 2
        ? side === "left"
          ? 90
          : -90
        : headingDeg(lookX || sign, lookY);
    return { x: p.x, y: p.y, rotation: face };
  });
}

function addFlight(
  tl: gsap.core.Timeline,
  el: HTMLElement,
  path: FlightPoint[],
  startAt: number,
  duration: number,
) {
  const first = path[0]!;
  gsap.set(el, {
    x: first.x,
    y: first.y,
    rotation: first.rotation,
    opacity: 0,
    scale: 0.92,
    transformOrigin: "50% 50%",
  });

  const seg = duration / Math.max(path.length - 1, 1);
  path.forEach((pt, i) => {
    if (i === 0) return;
    const isLast = i === path.length - 1;
    const props: gsap.TweenVars = {
      x: pt.x,
      y: pt.y,
      rotation: pt.rotation,
      duration: seg,
      ease: isLast ? "power2.out" : "sine.inOut",
    };
    if (i === 1) props.opacity = 1;
    if (isLast) props.scale = 1;
    tl.to(el, props, startAt + (i - 1) * seg);
  });
}

/**
 * Full-screen cinematic brand intro. Held on the wordmark while the Python
 * sidecar starts so packaged launches are not a blank window.
 */
export function LaunchScreen({ onComplete, hold = false, status }: LaunchScreenProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const finishedRef = useRef(false);
  const holdRef = useRef(hold);
  const onCompleteRef = useRef(onComplete);
  const [active, setActive] = useState(true);
  const [cinematicDone, setCinematicDone] = useState(false);

  holdRef.current = hold;
  onCompleteRef.current = onComplete;

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    markLaunchSeen();
    timelineRef.current?.kill();
    timelineRef.current = null;
    setActive(false);
    onCompleteRef.current();
  }

  function fadeOut() {
    if (finishedRef.current) return;
    const root = rootRef.current;
    timelineRef.current?.kill();
    timelineRef.current = null;
    if (!root) {
      finish();
      return;
    }
    gsap.to(root, {
      opacity: 0,
      duration: 0.35,
      ease: "power2.inOut",
      onComplete: finish,
    });
  }

  function tryDismiss() {
    setCinematicDone(true);
    if (holdRef.current) return;
    fadeOut();
  }

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || finishedRef.current) return;

    const reduced = prefersReducedMotion();
    const glow = root.querySelector<HTMLElement>(".launch-ambient");
    const left = root.querySelector<HTMLElement>(".launch-twin-left");
    const right = root.querySelector<HTMLElement>(".launch-twin-right");
    const leftWings = root.querySelectorAll(".launch-twin-left .launch-bf-wings");
    const rightWings = root.querySelectorAll(".launch-twin-right .launch-bf-wings");
    const pulse = root.querySelector<HTMLElement>(".launch-fuse-pulse");
    const radiate = root.querySelector<HTMLElement>(".launch-fuse-radiate");
    const particles = root.querySelectorAll<HTMLElement>(".launch-particle");
    const wordmark = root.querySelector<HTMLElement>(".launch-wordmark");
    const wordWrap = root.querySelector<HTMLElement>(".launch-wordmark-wrap");
    const wordmask = root.querySelector<HTMLElement>(".launch-wordmark-mask");
    const subtitle = root.querySelector<HTMLElement>(".launch-subtitle");

    gsap.set(root, { opacity: 1 });
    gsap.set(glow, { opacity: 0, scale: 0.6 });
    gsap.set([left, right], {
      opacity: 0,
      x: 0,
      y: 0,
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      transformOrigin: "50% 50%",
    });
    gsap.set(pulse, { opacity: 0, scaleX: 0.08, scaleY: 1 });
    gsap.set(radiate, { opacity: 0, scale: 0.015 });
    gsap.set(particles, { opacity: 0, x: 0, y: 0, scale: 0.4 });
    gsap.set(wordWrap, { opacity: 0, scale: 0.28, transformOrigin: "50% 50%" });
    gsap.set(wordmark, {
      opacity: 1,
      textShadow: `0 0 24px rgba(125, 220, 255, 0.55)`,
    });
    gsap.set(wordmask, { scaleX: 0.12, scaleY: 0.35, transformOrigin: "50% 50%" });
    gsap.set(subtitle, { opacity: 0, y: 10 });

    if (reduced) {
      const tl = gsap.timeline({
        defaults: { ease: "power2.out" },
        onComplete: tryDismiss,
      });
      timelineRef.current = tl;
      tl.to(glow, { opacity: 0.35, scale: 1, duration: 0.25 }, 0);
      tl.to(wordWrap, { opacity: 1, scale: 1, duration: 0.35 }, 0.08);
      tl.to(wordmask, { scaleX: 1, scaleY: 1, duration: 0.35 }, 0.08);
      tl.to(subtitle, { opacity: 1, y: 0, duration: 0.3 }, 0.22);
      tl.to(root, { duration: 0.01 }, LAUNCH_REDUCED_DURATION_S - 0.35);
      return () => {
        tl.kill();
        if (timelineRef.current === tl) timelineRef.current = null;
      };
    }

    const tl = gsap.timeline({
      defaults: { ease: "power2.inOut" },
      onComplete: tryDismiss,
    });
    timelineRef.current = tl;

    // 0.0–0.5: black + ambient
    tl.to(glow, { opacity: 0.22, scale: 1, duration: 0.5, ease: "power1.out" }, 0);

    const vw = Math.min(window.innerWidth, 1600);
    const enterX = Math.max(vw * 0.42, 220);
    const leftPath = buildApproachPath("left", enterX);
    const rightPath = buildApproachPath("right", enterX);

    // Approach: wandering flights that converge while facing each other
    if (left) addFlight(tl, left, leftPath, APPROACH_START, APPROACH_DUR);
    if (right) addFlight(tl, right, rightPath, APPROACH_START, APPROACH_DUR);

    const beat = (targets: NodeListOf<Element>, at: number) => {
      tl.to(targets, { scaleX: 0.72, duration: 0.14, ease: "sine.inOut" }, at);
      tl.to(targets, { scaleX: 1, duration: 0.16, ease: "sine.inOut" }, at + 0.14);
    };
    beat(leftWings, 0.32);
    beat(rightWings, 0.38);
    beat(leftWings, 0.64);
    beat(rightWings, 0.7);
    beat(leftWings, 0.98);
    beat(rightWings, 1.04);

    // Meet: face each other, align, compress
    tl.to(glow, { opacity: 0.5, scale: 1.2, duration: 0.55 }, MEET_AT);
    tl.to(
      left,
      { rotation: 90, scale: 0.88, duration: 0.2, ease: "power1.out" },
      MEET_AT + 0.05,
    );
    tl.to(
      right,
      { rotation: -90, scale: 0.88, duration: 0.2, ease: "power1.out" },
      MEET_AT + 0.05,
    );
    tl.to(
      [left, right],
      { scaleX: 0.12, scaleY: 1.05, opacity: 0.35, duration: 0.35, ease: "power3.in" },
      MEET_AT + 0.2,
    );

    // Fuse: bright core flash + particles
    tl.set([left, right], { opacity: 0 }, FUSE_AT);
    tl.fromTo(
      pulse,
      { opacity: 0, scaleX: 0.06, scaleY: 0.6 },
      { opacity: 1, scaleX: 1.2, scaleY: 1.4, duration: 0.32, ease: "power2.out" },
      FUSE_AT,
    );
    tl.to(
      pulse,
      { scaleX: 1.05, opacity: 1, duration: 0.35, ease: "power2.inOut" },
      FUSE_AT + 0.3,
    );
    tl.to(glow, { opacity: 0.7, scale: 1.35, duration: 0.4 }, FUSE_AT);

    particles.forEach((p, i) => {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (i % 2) * 0.2;
      const dist = 36 + (i % 5) * 18;
      tl.fromTo(
        p,
        { opacity: 0, x: 0, y: 0, scale: 0.3 },
        {
          opacity: 0.85,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist * 0.4,
          scale: 1,
          duration: 0.4,
          ease: "power2.out",
        },
        FUSE_AT + 0.04 + (i % 4) * 0.02,
      );
      tl.to(p, { opacity: 0, duration: 0.55, ease: "power1.in" }, FUSE_AT + 0.4 + (i % 3) * 0.03);
    });

    // Radiate: bright wash expands to screen edges, fading with distance/time
    // while wordmark blooms from the same center
    tl.fromTo(
      radiate,
      { opacity: 0.95, scale: 0.02 },
      { opacity: 0, scale: 1, duration: 1.15, ease: "power2.out" },
      RADIATE_AT,
    );
    tl.to(
      pulse,
      { opacity: 0, scaleX: 1.8, scaleY: 3.2, duration: 0.7, ease: "power2.out" },
      RADIATE_AT,
    );
    tl.to(glow, { opacity: 0.28, scale: 1.05, duration: 0.9, ease: "power2.out" }, RADIATE_AT);

    tl.to(
      wordWrap,
      { opacity: 1, scale: 1, duration: 0.75, ease: "power3.out" },
      WORDMARK_AT,
    );
    tl.to(
      wordmask,
      { scaleX: 1, scaleY: 1, duration: 0.7, ease: "power3.out" },
      WORDMARK_AT,
    );
    tl.to(
      wordmark,
      {
        textShadow: `0 0 0px rgba(125, 220, 255, 0)`,
        duration: 0.65,
        ease: "power2.out",
      },
      WORDMARK_AT + 0.2,
    );

    // Subtitle settles beneath
    tl.to(subtitle, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, SUBTITLE_AT);

    // Hold + subtle wordmark pulse
    tl.to(
      wordmark,
      {
        textShadow: `0 0 18px rgba(125, 220, 255, 0.35), 0 0 2px ${LAUNCH_COLORS.ice}`,
        duration: 0.28,
        ease: "sine.inOut",
        yoyo: true,
        repeat: 1,
      },
      HOLD_PULSE_AT,
    );

    // Hold the wordmark; fade is owned by tryDismiss so Python boot can fill this beat.
    tl.to(root, { duration: 0.01 }, LAUNCH_DURATION_S - 0.35);

    return () => {
      tl.kill();
      if (timelineRef.current === tl) timelineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hold && cinematicDone && !finishedRef.current) {
      fadeOut();
    }
  }, [hold, cinematicDone]);

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
      timelineRef.current = null;
    };
  }, []);

  if (!active) return null;

  return (
    <div
      ref={rootRef}
      className={`launch-screen${hold ? " is-holding" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Adelpha introduction"
      aria-busy={hold}
    >
      <OverlayChrome />
      <div className="launch-ambient" aria-hidden />
      <div className="launch-stage" aria-hidden>
        <div className="launch-twin launch-twin-left">
          <TwinButterfly className="launch-bf" accentEmerald />
        </div>
        <div className="launch-twin launch-twin-right">
          <TwinButterfly className="launch-bf" />
        </div>

        <div className="launch-fuse-radiate" />
        <div className="launch-fuse-pulse" />
        <div className="launch-particles">
          {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
            <span
              key={i}
              className={`launch-particle${i % 5 === 0 ? " launch-particle-emerald" : ""}`}
            />
          ))}
        </div>
      </div>

      <div className="launch-lockup">
        <div className="launch-wordmark-wrap">
          <div className="launch-wordmark-mask">
            <h1 className="launch-wordmark">{LAUNCH_COPY.wordmark}</h1>
          </div>
        </div>
        <p className="launch-subtitle">{LAUNCH_COPY.subtitle}</p>
        {status && cinematicDone ? (
          <p className="launch-status" role="status">
            {status}
          </p>
        ) : null}
      </div>
    </div>
  );
}
