"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

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

/** Today in the browser's own calendar day, as YYYY-MM-DD. */
function todayIso() {
  const n = new Date();
  return toIso(n.getFullYear(), n.getMonth(), n.getDate());
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]; // Monday-first, like the Content Calendar
const DAY_MS = 24 * 60 * 60 * 1000;
const POPUP_WIDTH = 296;
const POPUP_HEIGHT = 372;

/** The 6×7 grid of days (Monday first) that shows month `m` (0-11) of year `y`, including the spill-over days. */
function monthGrid(y: number, m: number) {
  const first = Date.UTC(y, m, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const start = first - lead * DAY_MS;
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start + i * DAY_MS);
    return { iso: toIso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), day: d.getUTCDate(), inMonth: d.getUTCMonth() === m };
  });
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d={dir === "left" ? "M12 5l-5 5 5 5" : "M8 5l5 5-5 5"} />
    </svg>
  );
}

/**
 * A date field that always reads and types as DD/MM/YYYY, whatever the browser's own locale is (the native date input
 * follows the browser/OS language, so it showed MM/DD/YYYY for some people). Type the date, or click the calendar icon
 * to pick one from the app's own calendar popup (month and year pickers, Today / Clear, dates outside min/max greyed
 * out). The form still receives the standard ISO value (YYYY-MM-DD) under `name`, so every server action and filter
 * works unchanged.
 *
 * Use it like a controlled or uncontrolled input: `defaultValue` (ISO) alone, or `value` + `onValueChange` (ISO).
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

  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: 2026, m: 0 });
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);

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

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) textRef.current?.focus();
  }, []);

  function openPopup() {
    if (disabled) return;
    const anchor = wrapRef.current?.getBoundingClientRect();
    if (!anchor) return;
    // Open on the chosen date's month (or today's), below the field unless there is no room.
    const base = /^(\d{4})-(\d{2})-/.exec(iso) ?? /^(\d{4})-(\d{2})-/.exec(todayIso())!;
    setView({ y: Number(base[1]), m: Number(base[2]) - 1 });
    const below = window.innerHeight - anchor.bottom;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - POPUP_WIDTH - 8));
    setPos(
      below < POPUP_HEIGHT && anchor.top > below
        ? { bottom: window.innerHeight - anchor.top + 6, left }
        : { top: anchor.bottom + 6, left },
    );
    setOpen(true);
  }

  // Outside click / scroll / resize close the popup (it is positioned against the viewport), like the app's dropdowns.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (popupRef.current?.contains(n) || buttonRef.current?.contains(n)) return;
      close(false);
    };
    const onScroll = (e: Event) => {
      if (popupRef.current?.contains(e.target as Node)) return;
      close(false);
    };
    const onResize = () => close(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  // Put keyboard focus on the chosen day (or today) so the popup is usable without a mouse.
  useEffect(() => {
    if (!open) return;
    const root = popupRef.current;
    const el =
      root?.querySelector<HTMLElement>("[data-selected='true']:not(:disabled)") ??
      root?.querySelector<HTMLElement>("[data-today='true']:not(:disabled)") ??
      root?.querySelector<HTMLElement>("[data-day]:not(:disabled)");
    el?.focus();
  }, [open]);

  const inRange = (d: string) => !(min && d < min) && !(max && d > max);

  function pick(d: string) {
    setDraft(null);
    commit(d);
    close();
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const t = v.y * 12 + v.m + delta;
      return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
    });
  }

  const today = todayIso();
  const yearChoices = (() => {
    const lo = Math.min(Number(today.slice(0, 4)) - 5, view.y, min ? Number(min.slice(0, 4)) : 9999);
    const hi = Math.max(Number(today.slice(0, 4)) + 10, view.y, max ? Number(max.slice(0, 4)) : 0);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  })();
  const grid = open ? monthGrid(view.y, view.m) : [];

  const navBtn =
    "flex h-8 w-8 items-center justify-center rounded-lg text-gs-gray transition-colors hover:bg-gs-light hover:text-gs-black focus-visible:outline-2 focus-visible:outline-gs-red";
  const miniSelect =
    "h-8 cursor-pointer rounded-lg border border-transparent bg-transparent px-1.5 text-sm font-semibold text-gs-black transition-colors hover:bg-gs-light focus:border-gs-gray/30 focus:outline-none";

  return (
    <div ref={wrapRef} className="relative">
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
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            openPopup();
          }
        }}
        className={`${className} w-full pr-10`}
      />
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : openPopup())}
        disabled={disabled}
        aria-label="Open calendar"
        aria-haspopup="dialog"
        aria-expanded={open}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gs-gray hover:text-gs-black disabled:opacity-40"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
          <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
          <path d="M3 8.5h14M7 2.8v3M13 2.8v3" />
        </svg>
      </button>
      {name && <input type="hidden" name={name} value={iso} />}

      {open &&
        pos &&
        createPortal(
          <div
            ref={popupRef}
            role="dialog"
            aria-label="Choose a date"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                close();
              }
            }}
            style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: POPUP_WIDTH }}
            className="anim-pop z-[100] rounded-xl border border-gs-gray/15 bg-white p-3 shadow-xl outline-none"
          >
            <div className="flex items-center justify-between gap-1">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className={navBtn}>
                <Chevron dir="left" />
              </button>
              <div className="flex items-center">
                <select
                  aria-label="Month"
                  value={view.m}
                  onChange={(e) => setView((v) => ({ ...v, m: Number(e.target.value) }))}
                  className={miniSelect}
                >
                  {MONTHS.map((label, i) => (
                    <option key={label} value={i}>{label}</option>
                  ))}
                </select>
                <select
                  aria-label="Year"
                  value={view.y}
                  onChange={(e) => setView((v) => ({ ...v, y: Number(e.target.value) }))}
                  className={miniSelect}
                >
                  {yearChoices.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className={navBtn}>
                <Chevron dir="right" />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wide text-gs-gray/80">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1.5">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {grid.map((cell) => {
                const selected = cell.iso === iso;
                const isToday = cell.iso === today;
                const ok = inRange(cell.iso);
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    data-day
                    data-selected={selected}
                    data-today={isToday}
                    disabled={!ok}
                    aria-label={isoToDisplay(cell.iso)}
                    aria-pressed={selected}
                    onClick={() => pick(cell.iso)}
                    className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-gs-red ${
                      selected
                        ? "bg-gs-red font-semibold text-white shadow-sm"
                        : !ok
                          ? "cursor-not-allowed text-gs-gray/30"
                          : isToday
                            ? "font-semibold text-gs-red ring-1 ring-gs-red/50 hover:bg-gs-red/10"
                            : cell.inMonth
                              ? "text-gs-black hover:bg-gs-light"
                              : "text-gs-gray/50 hover:bg-gs-light"
                    }`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-gs-gray/10 pt-2 text-sm">
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  commit("");
                  close();
                }}
                disabled={!iso}
                className="rounded-md px-2 py-1 font-medium text-gs-gray transition-colors hover:bg-gs-light hover:text-gs-black disabled:opacity-40"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => pick(today)}
                disabled={!inRange(today)}
                className="rounded-md px-2 py-1 font-medium text-gs-red transition-colors hover:bg-gs-red/10 disabled:opacity-40"
              >
                Today
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
