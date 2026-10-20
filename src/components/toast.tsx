"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastKind = "success" | "error";
type Toast = { id: number; message: string; kind: ToastKind; leaving?: boolean };

type ToastContextValue = {
  addToast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Confirmations clear quickly; an error stays long enough to read and act on.
const DURATION_MS: Record<ToastKind, number> = { success: 3500, error: 7000 };
// Must match the .toast-out animation length in globals.css.
const EXIT_MS = 200;

/** Every user action confirms with a toast (PRD 8.2.3) — nothing happens silently. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  // A no-op fallback keeps components usable outside the provider (e.g. the login screen)
  // rather than throwing — they simply show no toast there.
  return ctx ?? { addToast: () => {} };
}

function ToastIcon({ kind }: { kind: ToastKind }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-5 w-5 shrink-0"
    >
      {kind === "error" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5M12 16h.01" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.2l2.8 2.8L16 9.5" />
        </>
      )}
    </svg>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  // Two steps so a toast slides out instead of vanishing: flag it as leaving (plays the exit
  // animation), then remove it once that animation is done.
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const addToast = useCallback(
    (message: string, kind: ToastKind = "success") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, kind }]);
      setTimeout(() => dismiss(id), DURATION_MS[kind]);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`${t.leaving ? "toast-out" : "toast-in"} pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-l-4 bg-white py-3 pl-3 pr-2 text-sm shadow-lg ${
              t.kind === "error" ? "border-gs-red/20 border-l-gs-red" : "border-gs-gray/15 border-l-green-500"
            }`}
          >
            <span className={t.kind === "error" ? "text-gs-red" : "text-green-600"}>
              <ToastIcon kind={t.kind} />
            </span>
            <p className="min-w-0 flex-1 pt-px font-medium text-gs-black">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gs-gray hover:bg-gs-light hover:text-gs-black"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="h-4 w-4">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
