"use client";

import { useToast } from "@/components/toast";

/**
 * "Copy link": copies the full address of a page (`path` on this site) to the clipboard so it can be pasted into a
 * chat or email. Falls back to a hidden-textarea copy where the clipboard API isn't available.
 */
export function CopyLinkButton({
  path,
  noun,
  label = "Copy link",
  className = "btn btn-secondary btn-sm",
  iconOnly = false,
}: {
  /** Site-relative path, e.g. `/projects/abc`. */
  path: string;
  /** What is being linked, for the toast and tooltip ("project", "task"). */
  noun: string;
  label?: string;
  className?: string;
  /** Just the link icon (with an accessible name) — for dense table rows. */
  iconOnly?: boolean;
}) {
  const { addToast } = useToast();

  async function copy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      if (!ok) {
        addToast("Couldn't copy the link — copy it from the address bar instead.", "error");
        return;
      }
    }
    addToast(`${noun.charAt(0).toUpperCase()}${noun.slice(1)} link copied.`, "success");
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={className}
      title={`Copy a link to this ${noun}`}
      aria-label={iconOnly ? `Copy ${noun} link` : undefined}
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={`inline-block h-4 w-4 align-[-2px] ${iconOnly ? "" : "mr-1.5"}`}
      >
        <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5L9.8 5.2" />
        <path d="M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1.2-1.2" />
      </svg>
      {!iconOnly && label}
    </button>
  );
}
