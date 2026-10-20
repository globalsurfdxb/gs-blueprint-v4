"use client";

import { useEffect, useRef } from "react";

/**
 * A GET filter form that applies itself: any change to a select, checkbox or date submits it, so
 * there is no "Apply" button to forget (QA D-06). Typed text waits for a short pause first.
 *
 * A "Custom range" choice isn't submitted until its dates are both filled in — otherwise picking
 * "Custom" would reload the page with an empty, invalid range.
 */
export function AutoFilterForm({ className, children }: { className?: string; children: React.ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function schedule(target: EventTarget) {
    const form = formRef.current;
    if (!form) return;

    const wantsCustomRange = Array.from(form.querySelectorAll("select")).some((s) => s.value === "custom");
    if (wantsCustomRange) {
      const dates = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="date"]'));
      // Switching to "Custom" only reveals the date inputs; wait until they're all filled.
      if (dates.length === 0 || dates.some((d) => !d.value)) return;
    }

    const typing = target instanceof HTMLInputElement && (target.type === "text" || target.type === "search");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => form.requestSubmit(), typing ? 400 : 0);
  }

  return (
    <form ref={formRef} method="get" className={className} onChange={(e) => schedule(e.target)}>
      {children}
    </form>
  );
}
