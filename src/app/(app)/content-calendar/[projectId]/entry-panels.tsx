"use client";

import { useEffect, useRef, useState } from "react";
import { UrgentIcon } from "./urgent-tag";

type Tab = "entry" | "urgent";
const OPEN_EVENT = "calendar:open-panel";

/**
 * A button for the page header that jumps to the add panel below and opens the right tab ("+ Add entry" / "Urgent
 * task"). It only talks to <EntryPanels> through a window event, so the two can sit far apart on the page.
 */
export function OpenPanelButton({
  tab,
  className,
  children,
}: {
  tab: Tab;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: tab }))} className={className}>
      {children}
    </button>
  );
}

/**
 * The main card of the Content Calendar list view: "Add entry" (Social Media Lead / Admin) and "Urgent task" (Social
 * Media Cluster Head / Admin) as two tabs. Both forms stay mounted, so switching tabs never loses what was typed. A
 * person who can only use one of them just gets that form under a heading.
 */
export function EntryPanels({
  entryForm,
  urgentForm,
}: {
  entryForm?: React.ReactNode;
  urgentForm?: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>(entryForm ? "entry" : "urgent");
  const ref = useRef<HTMLElement>(null);

  // A header button asked for a tab: switch to it, bring the card into view and put the cursor in its first field.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const wanted = (e as CustomEvent<Tab>).detail;
      if ((wanted === "entry" && entryForm) || (wanted === "urgent" && urgentForm)) setTab(wanted);
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => {
        ref.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), textarea")?.focus({ preventScroll: true });
      }, 350);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [entryForm, urgentForm]);

  if (!entryForm && !urgentForm) return null;
  const both = !!entryForm && !!urgentForm;

  const tabCls = (on: boolean, urgent: boolean) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
      on
        ? urgent
          ? "bg-white text-gs-red shadow-sm"
          : "bg-white text-gs-black shadow-sm"
        : "text-gs-gray hover:text-gs-black"
    }`;

  return (
    <section
      ref={ref}
      id="add-to-calendar"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-gs-red/25 border-t-4 border-t-gs-red bg-white shadow-md shadow-gs-red/5"
    >
      {both ? (
        <>
          <h2 className="px-5 pt-4 font-heading text-lg font-semibold tracking-tight">Add to the calendar</h2>
          <div role="tablist" aria-label="Add to the calendar" className="mx-4 mt-3 flex gap-1 rounded-xl bg-gs-light p-1">
            <button type="button" role="tab" aria-selected={tab === "entry"} onClick={() => setTab("entry")} className={tabCls(tab === "entry", false)}>
              Add entry
            </button>
            <button type="button" role="tab" aria-selected={tab === "urgent"} onClick={() => setTab("urgent")} className={tabCls(tab === "urgent", true)}>
              <UrgentIcon /> Urgent task
            </button>
          </div>
        </>
      ) : (
        <h2 className="flex items-center gap-2 px-5 pt-4 font-heading text-lg font-semibold tracking-tight">
          {urgentForm ? (
            <>
              <span className="text-gs-red"><UrgentIcon className="h-4 w-4" /></span> Add urgent task
            </>
          ) : (
            "Add entry"
          )}
        </h2>
      )}

      {entryForm && (
        <div className={`px-5 pb-5 pt-4 ${both && tab !== "entry" ? "hidden" : ""}`}>
          <p className="mb-3 text-xs text-gs-gray">
            Plan a post: its Content task is created for the Content team, due before the Publish Date.
          </p>
          {entryForm}
        </div>
      )}
      {urgentForm && (
        <div className={`px-5 pb-5 pt-4 ${both && tab !== "urgent" ? "hidden" : ""}`}>
          <p className="mb-3 text-xs text-gs-gray">
            For work that can&apos;t wait. It goes to the teams you choose, shows on this calendar with an Urgent tag, and the
            Social Media Lead can follow it.
          </p>
          {urgentForm}
        </div>
      )}
    </section>
  );
}
