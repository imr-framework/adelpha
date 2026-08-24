import { type ReactNode } from "react";
import { X } from "lucide-react";

export function Overlay({
  title,
  onClose,
  children,
  wide,
  variant,
  size,
  footer,
  dismissOnBackdrop = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  variant?: "m4";
  size?: "study" | "status" | "log" | "config" | "flex" | "flex-max";
  footer?: ReactNode;
  dismissOnBackdrop?: boolean;
}) {
  return (
    <div
      className={`ic-register${variant === "m4" ? " is-m4" : ""}${size === "flex" || size === "flex-max" ? " is-flex-layer" : ""}`}
      role="dialog"
      aria-labelledby="ic-dialog-title"
      onClick={dismissOnBackdrop ? onClose : undefined}
    >
      <div
        className={`ic-register-card${wide ? " is-wide" : ""}${size ? ` is-${size}` : ""}${variant === "m4" ? " is-m4" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ic-dialog-head">
          <h2 id="ic-dialog-title">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="ic-dialog-body">{children}</div>
        {footer ? <div className="ic-dialog-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
