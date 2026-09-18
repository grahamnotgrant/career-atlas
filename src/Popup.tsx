import { useEffect, useRef, type ReactNode } from "react";
export function Popup({
  title,
  wide = false,
  onClose,
  onBack,
  children,
  canGoBack = true,
}: {
  title: string;
  wide?: boolean;
  onClose: () => void;
  onBack?: () => void;
  canGoBack?: boolean;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null),
    lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    lastFocus.current = document.activeElement as HTMLElement;
    const background = document.querySelector<HTMLElement>("#scene-workspace");
    if (background) background.inert = true;
    panel.current?.focus({ preventScroll: true });
    return () => {
      if (background) background.inert = false;
      lastFocus.current?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab" && panel.current) {
        const nodes = [
          ...panel.current.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input, textarea, a[href], select, summary",
          ),
        ].filter((el) => el.getClientRects().length);
        const first = nodes[0],
          last = nodes.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panel.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === panel.current)
        ) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div className="popup-layer">
      <div className="popup-dismiss" onClick={onClose} aria-hidden="true" />
      <section
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`floating-popup ${wide ? "document-popup" : ""}`}
      >
        <div className="popup-navigation">
          <button
            onClick={onBack ?? onClose}
            disabled={!canGoBack && !!onBack}
            className="back-button"
          >
            ← Back
          </button>
          <span>{title}</span>
          <button
            className="close-button"
            aria-label="Close popup"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
