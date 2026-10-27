"use client";

import { useState } from "react";

export type TabDef = {
  key: string;
  label: string;
  /** Small count badge beside the label (comments, subtasks…). Hidden when 0 or omitted. */
  count?: number;
  content: React.ReactNode;
};

/**
 * Tabbed work area of the task page (Zoho-style): one tab per kind of work — comments, subtasks, time,
 * links, content, history — so the page stays short instead of stacking every section. Every panel is
 * rendered up front and only hidden, so a half-typed comment or open form survives a tab switch.
 */
export function TaskTabs({ tabs }: { tabs: TabDef[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const current = tabs.some((t) => t.key === active) ? active : (tabs[0]?.key ?? "");

  return (
    <section className="rounded-xl border border-gs-gray/10 bg-white shadow-sm">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-gs-gray/10 px-3">
        {tabs.map((t) => {
          const selected = t.key === current;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`panel-${t.key}`}
              onClick={() => setActive(t.key)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-3 text-sm font-medium transition-colors ${
                selected
                  ? "border-gs-red text-gs-black"
                  : "border-transparent text-gs-gray hover:text-gs-black"
              }`}
            >
              {t.label}
              {!!t.count && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                    selected ? "bg-gs-red/10 text-gs-red" : "bg-gs-light text-gs-gray"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          id={`panel-${t.key}`}
          aria-labelledby={`tab-${t.key}`}
          hidden={t.key !== current}
          className="flex flex-col gap-4 p-5 [&>*]:mt-0!"
        >
          {t.content}
        </div>
      ))}
    </section>
  );
}
