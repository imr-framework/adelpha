import { useId, type SVGProps } from "react";

export type TwinButterflyProps = SVGProps<SVGSVGElement> & {
  /** Soft emerald accent on wing tips (one twin only). */
  accentEmerald?: boolean;
  wingGroupClassName?: string;
};

/**
 * Abstract twin butterfly — magnetic-flux contour wings.
 * Geometrically identical; mirror via CSS transform on a parent or class.
 */
export function TwinButterfly({
  accentEmerald = false,
  wingGroupClassName = "launch-bf-wings",
  className,
  ...rest
}: TwinButterflyProps) {
  const uid = useId().replace(/:/g, "");
  const fillId = `bf-wing-fill-${uid}`;
  const glowId = `bf-soft-glow-${uid}`;
  const tipStroke = accentEmerald ? "#31D89B" : "#9EE9FF";
  const tipOpacity = accentEmerald ? 0.72 : 0.55;

  return (
    <svg
      className={className}
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...rest}
    >
      <defs>
        <linearGradient id={fillId} x1="20" y1="20" x2="100" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7DDCFF" stopOpacity="0.14" />
          <stop offset="55%" stopColor="#F2F4F7" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#7DDCFF" stopOpacity="0.08" />
        </linearGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className="launch-bf-body" strokeLinecap="round" strokeLinejoin="round">
        <line x1="60" y1="22" x2="60" y2="78" stroke="#F2F4F7" strokeWidth="1.15" opacity="0.88" />
        <line x1="60" y1="28" x2="60" y2="72" stroke="#7DDCFF" strokeWidth="0.55" opacity="0.55" />
        <circle cx="60" cy="20" r="1.6" fill="#F2F4F7" opacity="0.9" />
        <path d="M60 20 C56 12 52 8 48 6" stroke="#C8D0D8" strokeWidth="0.7" opacity="0.55" />
        <path d="M60 20 C64 12 68 8 72 6" stroke="#C8D0D8" strokeWidth="0.7" opacity="0.55" />
      </g>

      <g className={wingGroupClassName} filter={`url(#${glowId})`}>
        <path
          d="M58 38
             C48 28 34 22 22 20
             C18 28 20 42 28 52
             C38 48 50 44 58 42 Z"
          fill={`url(#${fillId})`}
          stroke="#7DDCFF"
          strokeWidth="1.05"
          opacity="0.95"
        />
        <path d="M54 40 C42 32 30 26 22 24" stroke="#E8EEF4" strokeWidth="0.55" opacity="0.45" />
        <path d="M52 44 C40 38 30 34 26 36" stroke="#7DDCFF" strokeWidth="0.5" opacity="0.5" />
        <path d="M50 48 C40 44 32 42 28 46" stroke={tipStroke} strokeWidth="0.55" opacity={tipOpacity} />

        <path
          d="M58 52
             C48 58 36 68 28 78
             C36 82 48 74 56 62
             C58 58 58 54 58 52 Z"
          fill={`url(#${fillId})`}
          stroke="#A8D8EC"
          strokeWidth="0.95"
          opacity="0.88"
        />
        <path d="M54 56 C44 62 36 70 32 74" stroke="#7DDCFF" strokeWidth="0.45" opacity="0.45" />

        <path
          d="M62 38
             C72 28 86 22 98 20
             C102 28 100 42 92 52
             C82 48 70 44 62 42 Z"
          fill={`url(#${fillId})`}
          stroke="#7DDCFF"
          strokeWidth="1.05"
          opacity="0.95"
        />
        <path d="M66 40 C78 32 90 26 98 24" stroke="#E8EEF4" strokeWidth="0.55" opacity="0.45" />
        <path d="M68 44 C80 38 90 34 94 36" stroke="#7DDCFF" strokeWidth="0.5" opacity="0.5" />
        <path d="M70 48 C80 44 88 42 92 46" stroke={tipStroke} strokeWidth="0.55" opacity={tipOpacity} />

        <path
          d="M62 52
             C72 58 84 68 92 78
             C84 82 72 74 64 62
             C62 58 62 54 62 52 Z"
          fill={`url(#${fillId})`}
          stroke="#A8D8EC"
          strokeWidth="0.95"
          opacity="0.88"
        />
        <path d="M66 56 C76 62 84 70 88 74" stroke="#7DDCFF" strokeWidth="0.45" opacity="0.45" />
      </g>
    </svg>
  );
}
