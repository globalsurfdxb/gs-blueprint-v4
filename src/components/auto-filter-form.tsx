"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A GET filter form that applies itself: any change to a select, checkbox or date updates the page
 * straight away, so there is no "Apply" button to forget (QA D-06). Typed text waits for a short
 * pause first.
 *
 * It updates the URL with a client-side navigation instead of submitting the form, so the page does
 * not reload: the input you are typing in keeps focus, scroll position stays put, and the list
 * refreshes underneath. Empty fields are left out of the URL, keeping links tidy. Plain submit
 * (Enter) still works as a normal GET.
 *
 * A "Custom range" choice isn't applied until its dates are both filled in — otherwise picking
 * "Custom" would refresh the page with an empty, invalid range.
 */
export function AutoFilterForm({ className, children }: { className?: string; children: React.ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  // The fields are uncontrolled (they start from the URL). When the URL changes for any reason OTHER
  // than this form applying itself — a "Clear" link, back/forward, a deep link — remount the form so
  // every field picks up the new values instead of showing stale ones.
  const urlQuery = searchParams.toString();
  const [seenQuery, setSeenQuery] = useState(urlQuery);
  const [ownQuery, setOwnQuery] = useState(urlQuery);
  const [epoch, setEpoch] = useState(0);
  if (urlQuery !== seenQuery) {
    setSeenQuery(urlQuery);
    if (urlQuery !== ownQuery) {
      setOwnQuery(urlQuery);
      setEpoch((e) => e + 1);
    }
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function apply(form: HTMLFormElement) {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      if (typeof value === "string" && value !== "") params.append(key, value);
    }
    const qs = params.toString();
    setOwnQuery(qs); // our own change — the form must keep its fields and focus
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

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
    timer.current = setTimeout(() => apply(form), typing ? 350 : 0);
  }

  return (
    <form
      key={epoch}
      ref={formRef}
      method="get"
      className={`${className ?? ""} ${pending ? "opacity-80" : ""}`}
      aria-busy={pending}
      onChange={(e) => schedule(e.target)}
      onSubmit={(e) => {
        // Enter in a text box: apply through the same in-place path rather than a full reload.
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        apply(e.currentTarget);
      }}
    >
      {children}
    </form>
  );
}
