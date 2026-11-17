"use client";

import { useEffect, useRef, useState } from "react";

/** "2026-11-05" → "05/11/2026" ("" stays ""). */
function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** "05/11/2026" → "2026-11-05", or null when it isn't a real calendar date. */
function displayToIso(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  const real = d.getUTCFullYear() === Number(yyyy) && d.getUTCMonth() === Number(mm) - 1 && d.getUTCDate() === Number(dd);
  return real ? `${yyyy}-${mm}-${dd}` : null;
}

/** Keep digits only and slot the slashes in as they type: "0511" → "05/11". */
function mask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * A date field that always reads and types as DD/MM/YYYY, whatever the browser's own locale is (the native date input
 * follows the browser/OS language, so it showed MM/DD/YYYY for some people). Type the date, or click the calendar icon
 * to pick one. The form still receives the standard ISO value (YYYY-MM-DD) under \`name\`, so every server action and
 * filter works unchanged.
 *
 * Use it like a controlled or uncontrolled input: \`defaultValue\` (ISO) alone, or \`value\` + \`onValueChange\` (ISO).
 */
export function DateInput({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  required,
  disabled,
  min,
  max,
  className = "field",
  "aria-label": ariaLabel,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (iso: string) => void;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const controlled = value !== undefined;
  const [innerIso, setInnerIso] = useState(defaultValue ?? "");
  const iso = controlled ? value : innerIso;
  // What is being typed right now; null when not editing, so the box shows the current value formatted.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? isoToDisplay(iso);

  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  function commit(next: string) {
    if (!controlled) setInnerIso(next);
    onValueChange?.(next);
  }

  // Explain a half-typed or out-of-range date at submit time instead of silently dropping it.
  const typed = draft ?? "";
  let problem = "";
  if (typed !== "") {
    const parsed = displayToIso(typed);
    if (parsed === null) problem = "Enter the date as DD/MM/YYYY.";
    else if (min && parsed < min) problem = `The date can't be before ${isoToDisplay(min)}.`;
    else if (max && parsed > max) problem = `The date can't be after ${isoToDisplay(max)}.`;
  } else if (iso) {
    if (min && iso < min) problem = `The date can't be before ${isoToDisplay(min)}.`;
    else if (max && iso > max) problem = `The date can't be after ${isoToDisplay(max)}.`;
  }
  useEffect(() => {
    textRef.current?.setCustomValidity(problem);
  }, [problem]);

  function openPicker() {
    const el = pickerRef.current;
    if (!el || disabled) return;
    try {
      el.showPicker();
    } catch {
      el.focus(); // browsers without showPicker(): the field is still typeable
    }
  }

  return (
    <div className="relative">
      <input
        ref={textRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/YYYY"
        maxLength={10}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        value={shown}
        onChange={(e) => {
          const masked = mask(e.target.value);
          setDraft(masked);
          commit(displayToIso(masked) ?? "");
        }}
        onBlur={() => {
          // A complete, valid date (or nothing) settles into the formatted value; a half-typed one stays on screen.
          if (draft === "" || (draft !== null && displayToIso(draft) !== null)) setDraft(null);
        }}
        className={`${className} w-full pr-10`}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Open calendar"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gs-gray hover:text-gs-black disabled:opacity-40"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
          <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
          <path d="M3 8.5h14M7 2.8v3M13 2.8v3" />
        </svg>
      </button>
      {/* The browser's own calendar, kept out of sight: it only opens when the icon is clicked and hands back an ISO date. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={iso}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          setDraft(null);
          commit(e.target.value);
        }}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
      />
      {name && <input type="hidden" name={name} value={iso} />}
    </div>
  );
}
