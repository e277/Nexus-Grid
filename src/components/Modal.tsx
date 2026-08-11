import { useEffect } from "react";
import type { ReactNode } from "react";

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, subtitle, onClose, children }: ModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[10px] border border-ng-border bg-ng-surface shadow-ng-md"
      >
        <div className="flex items-start justify-between border-b border-ng-border px-5 py-3.5">
          <div>
            <h2 className="text-[13px] font-semibold text-ng-primary">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-ng-xs text-ng-secondary">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 text-ng-secondary transition-colors hover:bg-ng-bg hover:text-ng-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ng-accent"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
