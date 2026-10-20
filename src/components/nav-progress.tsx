"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A slim progress bar along the top edge while the next page loads. It starts when an in-app link is
 * clicked and completes when the URL actually changes — so slow pages never feel like a dead click.
 *
 * "Loading" is derived rather than stored: we remember the route we left (`startKey`); while the
 * current route still equals it we're loading, and the moment it differs we're finished.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const currentKey = `${pathname}?${search}`;

  const [startKey, setStartKey] = useState<string | null>(null);
  const keyRef = useRef(currentKey);
  useEffect(() => {
    keyRef.current = currentKey;
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Next's <Link> has already prevented the default full-page load by the time this bubbles up,
      // which is exactly the "client-side navigation is starting" signal we want.
      if (!e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setStartKey(keyRef.current);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const loading = startKey !== null && startKey === currentKey;
  const finished = startKey !== null && startKey !== currentKey;

  // Clear the bar shortly after it completes, and never leave it hanging if navigation stalls.
  useEffect(() => {
    if (startKey === null) return;
    const id = setTimeout(() => setStartKey(null), finished ? 700 : 12000);
    return () => clearTimeout(id);
  }, [startKey, finished]);

  const style: React.CSSProperties = loading
    ? { width: "85%", opacity: 1, transition: "width 8s cubic-bezier(0.1, 0.5, 0.3, 1)" }
    : finished
      ? { width: "100%", opacity: 0, transition: "width 180ms ease-out, opacity 350ms ease 180ms" }
      : { width: "0%", opacity: 0, transition: "none" };

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div
        className="h-full rounded-r-full bg-gradient-to-r from-gs-red to-[#ff7a59] shadow-[0_0_10px_rgba(230,62,49,0.7)]"
        style={style}
      />
    </div>
  );
}
