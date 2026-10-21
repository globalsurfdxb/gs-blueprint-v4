"use client";

import { useRef, useState } from "react";

/**
 * A password field with a show / hide toggle (eye icon at the right edge). It is a normal controlled
 * or uncontrolled <input> in every other respect — name, value, required, autoComplete, onChange all
 * pass straight through — so forms and browser password managers behave exactly as before. The toggle
 * is a real button (keyboard-reachable, announced as "Show password" / "Hide password") and hands
 * focus back to the field so typing can continue.
 */
export function PasswordInput({
  className = "field",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <input
        {...props}
        ref={inputRef}
        type={visible ? "text" : "password"}
        // Leave room for the toggle so long passwords never run under it.
        className={`${className} w-full pr-11`}
      />
      <button
        type="button"
        onClick={() => {
          setVisible((v) => !v);
          inputRef.current?.focus();
        }}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-gs-gray transition-colors hover:text-gs-black"
      >
        {visible ? (
          // eye-off
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
            <path d="M3 3l18 18" />
            <path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6-.4.8-1.2 2-2.4 3.2M6.5 7.6C4.6 9 3.3 10.8 2.5 12c1 2 4.5 6 9.5 6 1.4 0 2.7-.3 3.8-.8" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </svg>
        ) : (
          // eye
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
