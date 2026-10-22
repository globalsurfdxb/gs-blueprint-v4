"use client";

import { Children, Fragment, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A drop-in replacement for the native <select> used everywhere in the app: same props, same
 * <option>/<optgroup> children, same onChange(event) — but with a styled trigger, a styled popup
 * and a search box for longer lists.
 *
 * How it stays compatible: the real <select> is still rendered (invisible, on top of the trigger).
 * It keeps the form value, `required` validation, name, defaultValue/value, reset behaviour and the
 * React onChange handler. The custom UI only reads its options and, when you pick one, sets the
 * native value and fires a real "change" event — so forms, auto-applying filters and controlled
 * state all behave exactly as they did with the plain element.
 */

/** `sub` is an optional second line (from the option's `data-sub`), e.g. a project's client name. */
type Opt = { value: string; label: string; disabled: boolean; group: string | null; sub: string | null };

/** Show the search box once a list has more options than this (so every list of 4+ is searchable;
 * 2–3 choices such as Yes/No or Dubai/India stay a plain list). */
const SEARCH_THRESHOLD = 3;
const POPUP_MAX_HEIGHT = 288;

// Layout utilities belong on the outer wrapper (so `w-64`, `flex-1`, `mt-2`, `sm:w-48` size the
// control as before); everything else (border, padding, text) styles the trigger itself.
const WRAPPER_CLASS = /^(?:[a-z0-9-]+:)*(?:w-|min-w-|max-w-|flex-|grow|shrink|basis-|self-|justify-self|col-span-|row-span-|-?m[trblxy]?-|order-)/;

function splitClasses(className: string) {
  const wrapper: string[] = [];
  const trigger: string[] = [];
  for (const token of className.split(/\s+/).filter(Boolean)) {
    (WRAPPER_CLASS.test(token) ? wrapper : trigger).push(token);
  }
  return { wrapper: wrapper.join(" "), trigger: trigger.join(" ") };
}

function readOptions(select: HTMLSelectElement): Opt[] {
  const out: Opt[] = [];
  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      for (const o of Array.from(child.children)) {
        if (o instanceof HTMLOptionElement) {
          out.push({ value: o.value, label: o.text, disabled: o.disabled || child.disabled, group: child.label, sub: o.dataset.sub ?? null });
        }
      }
    } else if (child instanceof HTMLOptionElement) {
      out.push({ value: child.value, label: child.text, disabled: child.disabled, group: null, sub: child.dataset.sub ?? null });
    }
  }
  return out;
}

/** Plain text of an <option>'s children ("{name} · {client}" arrives as an array of strings). */
function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return "";
}

/**
 * Options read from the React children — available on the very first render (including the server
 * render), so the trigger already has its label and its width before the browser has anything to
 * measure. The DOM read in `sync` replaces this once mounted; they normally agree.
 */
function parseOptions(children: React.ReactNode, group: string | null = null, groupDisabled = false): Opt[] {
  const out: Opt[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as {
      value?: string | number;
      disabled?: boolean;
      label?: string;
      "data-sub"?: string;
      children?: React.ReactNode;
    };
    if (child.type === "optgroup") {
      out.push(...parseOptions(props.children, props.label ?? null, !!props.disabled));
    } else if (child.type === "option") {
      const label = textOf(props.children);
      out.push({
        value: props.value !== undefined ? String(props.value) : label,
        label,
        disabled: !!props.disabled || groupDisabled,
        group,
        sub: props["data-sub"] ?? null,
      });
    } else if (child.type === Fragment) {
      out.push(...parseOptions(props.children, group, groupDisabled));
    }
  });
  return out;
}

const sameOptions = (a: Opt[], b: Opt[]) =>
  a.length === b.length &&
  a.every((o, i) => o.value === b[i].value && o.label === b[i].label && o.disabled === b[i].disabled && o.group === b[i].group && o.sub === b[i].sub);

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, id, multiple, size, ...rest } = props;

  // Multi-selects and list boxes keep the native control.
  if (multiple || (size && size > 1)) {
    return (
      <select className={className} id={id} multiple={multiple} size={size} {...rest}>
        {children}
      </select>
    );
  }
  return (
    <SingleSelect className={className} id={id} {...rest}>
      {children}
    </SingleSelect>
  );
}

function SingleSelect({
  className = "",
  children,
  id,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [options, setOptions] = useState<Opt[]>(() => parseOptions(children));
  const [value, setValue] = useState(() => {
    const given = rest.value ?? rest.defaultValue;
    if (given !== undefined && !Array.isArray(given)) return String(given);
    // A native select with no value shows its first enabled option.
    return parseOptions(children).find((o) => !o.disabled)?.value ?? "";
  });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);

  // Mirror the native element's options + current value into state. Runs after every render so a
  // controlled `value`, changed children, or a form reset can never leave the trigger stale.
  const sync = useCallback(() => {
    const el = selectRef.current;
    if (!el) return;
    const next = readOptions(el);
    setOptions((prev) => (sameOptions(prev, next) ? prev : next));
    setValue((prev) => (prev === el.value ? prev : el.value));
  }, []);
  useLayoutEffect(() => {
    sync();
  });

  // Form reset (React clears uncontrolled fields after an action) happens without a re-render here.
  useEffect(() => {
    const form = selectRef.current?.form;
    if (!form) return;
    const onReset = () => setTimeout(sync, 0);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [sync]);

  const selectable = options.filter((o) => !(o.disabled && o.value === "")); // hide "Select…" placeholders
  const searchable = selectable.length > SEARCH_THRESHOLD;
  const q = query.trim().toLowerCase();
  const fullLabel = (o: Opt) => (o.sub ? `${o.label} · ${o.sub}` : o.label);
  const visible = q ? selectable.filter((o) => fullLabel(o).toLowerCase().includes(q)) : selectable;

  const current = options.find((o) => o.value === value);
  const showingPlaceholder = !current || (current.value === "" && current.disabled);
  const triggerLabel = current ? fullLabel(current) : "";
  const longestLabel = options.reduce((best, o) => (fullLabel(o).length > best.length ? fullLabel(o) : best), "");

  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const openUp = below < 220 && r.top > below;
    setPos(
      openUp
        ? { bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width }
        : { top: r.bottom + 4, left: r.left, width: r.width },
    );
  }, []);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openPopup = () => {
    if (rest.disabled) return;
    sync();
    const idx = selectable.findIndex((o) => o.value === value && !o.disabled);
    setActive(Math.max(0, idx));
    setQuery("");
    place();
    setOpen(true);
  };

  // Outside click / scroll / resize close the popup (it is positioned against the viewport).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (popupRef.current?.contains(n) || triggerRef.current?.contains(n)) return;
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

  // Move focus into the popup so typing searches and the arrow keys navigate.
  useEffect(() => {
    if (!open) return;
    (searchRef.current ?? popupRef.current)?.focus();
  }, [open]);

  // Keep the highlighted row in view and inside the filtered range.
  useEffect(() => {
    if (!open) return;
    popupRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, visible.length]);

  const choose = (opt: Opt) => {
    if (opt.disabled) return;
    const el = selectRef.current;
    if (el && el.value !== opt.value) {
      el.value = opt.value;
      // A real change event: React's onChange, auto-submitting filter forms and form listeners all fire.
      el.dispatchEvent(new Event("change", { bubbles: true }));
      setValue(opt.value);
    }
    close();
  };

  const onPopupKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(visible.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, visible.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = visible[active];
      if (opt) choose(opt);
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  const { wrapper, trigger } = splitClasses(className);
  const listId = `${id ?? "select"}-list`;

  return (
    <div className={`relative block min-w-0 max-w-full ${wrapper}`}>
      {/* The real control: owns the form value, validation and onChange. Invisible, not removed, so a
          `required` bubble still points at the field. */}
      <select
        ref={selectRef}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        {...rest}
      >
        {children}
      </select>

      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={rest.disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={rest["aria-label"]}
        data-select-trigger
        onClick={() => (open ? close() : openPopup())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) openPopup();
          }
        }}
        className={`field flex w-full items-center justify-between gap-2 text-left ${trigger} ${
          open ? "!border-gs-red !shadow-[0_0_0_3px_rgba(230,62,49,0.16)]" : ""
        }`}
      >
        {/* The invisible sizer holds the width of the longest option, so the control is as wide as
            its widest choice (like a native select) instead of collapsing to the current label;
            the visible label sits on top and truncates only when the container is narrower. */}
        <span className="relative min-w-0 flex-1">
          <span aria-hidden className="invisible block truncate whitespace-nowrap">
            {longestLabel || " "}
          </span>
          <span className={`absolute inset-0 block truncate ${showingPlaceholder ? "text-gs-gray" : ""}`}>
            {triggerLabel || " "}
          </span>
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={`h-4 w-4 shrink-0 text-gs-gray transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popupRef}
            tabIndex={-1}
            onKeyDown={onPopupKeyDown}
            style={{
              position: "fixed",
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              // Same width as the trigger (long labels wrap), never past the right edge of the screen.
              width: pos.width,
              maxWidth: `calc(100vw - ${pos.left}px - 0.5rem)`,
            }}
            className="anim-pop z-[100] flex flex-col overflow-hidden rounded-lg border border-gs-gray/20 bg-white shadow-xl outline-none"
          >
            {searchable && (
              <div className="border-b border-gs-gray/10 p-2">
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  placeholder="Search…"
                  aria-label="Search options"
                  autoComplete="off"
                  className="field field-sm w-full"
                />
              </div>
            )}
            <ul
              id={listId}
              role="listbox"
              style={{ maxHeight: POPUP_MAX_HEIGHT }}
              className="overflow-y-auto py-1"
            >
              {visible.length === 0 && <li className="px-3 py-2 text-sm text-gs-gray">No matches</li>}
              {visible.map((o, i) => {
                const prev = visible[i - 1];
                const showGroup = o.group && (!prev || prev.group !== o.group);
                return (
                  <li key={`${o.value}-${i}`} role="presentation">
                    {showGroup && (
                      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                        {o.group}
                      </p>
                    )}
                    <div
                      role="option"
                      data-idx={i}
                      aria-selected={o.value === value}
                      aria-disabled={o.disabled || undefined}
                      onMouseEnter={() => !o.disabled && setActive(i)}
                      onClick={() => choose(o)}
                      className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                        o.disabled
                          ? "cursor-not-allowed text-gs-gray/60"
                          : i === active
                            ? "bg-gs-red/10"
                            : ""
                      } ${o.value === value ? "font-medium" : ""}`}
                    >
                      <span className="min-w-0 break-words">
                        {o.label}
                        {o.sub && <span className="block text-xs font-normal text-gs-gray">{o.sub}</span>}
                      </span>
                      {o.value === value && (
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                          className="h-4 w-4 shrink-0 text-gs-red"
                        >
                          <path d="M4 10.5l4 4 8-9" />
                        </svg>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}

