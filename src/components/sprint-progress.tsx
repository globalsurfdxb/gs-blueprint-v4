import type { SprintCounts } from "@/lib/sprint-dashboard";

const SEGMENTS = [
  { key: "completed", label: "Done", bar: "bg-green-500", dot: "bg-green-500" },
  { key: "review", label: "In review", bar: "bg-violet-500", dot: "bg-violet-500" },
  { key: "inProgress", label: "In progress", bar: "bg-sky-500", dot: "bg-sky-500" },
  { key: "notStarted", label: "To do", bar: "bg-gs-gray/30", dot: "bg-gs-gray/40" },
] as const;

/** Wording for the four segments; the default reads as sprint/task work. */
export type ProgressLabels = { completed: string; review: string; inProgress: string; notStarted: string };
const DEFAULT_LABELS: ProgressLabels = {
  completed: "Done",
  review: "In review",
  inProgress: "In progress",
  notStarted: "To do",
};
/** The same bar for bugs: Closed / Ready for retest / In progress / Open. */
export const BUG_PROGRESS_LABELS: ProgressLabels = {
  completed: "Closed",
  review: "Ready for retest",
  inProgress: "In progress",
  notStarted: "Open",
};

/**
 * Sprint progress: one rounded bar split by where the work actually is (done / in review / in
 * progress / to do) with the completion percentage beside it, so a sprint reads at a glance instead
 * of as a single anonymous fill. `showLegend` adds the per-status counts underneath.
 */
export function SprintProgress({
  counts,
  showLegend = false,
  labels = DEFAULT_LABELS,
  size = "md",
  className = "",
}: {
  counts: SprintCounts;
  showLegend?: boolean;
  labels?: ProgressLabels;
  /** "sm" is a slim bar with small text, for cards where progress is supporting information. */
  size?: "sm" | "md";
  className?: string;
}) {
  const small = size === "sm";
  const { total } = counts;
  const pct = total > 0 ? Math.round((counts.completed / total) * 100) : 0;
  const summary =
    total === 0
      ? "Nothing here yet"
      : SEGMENTS.map((s) => `${counts[s.key]} ${labels[s.key].toLowerCase()}`).join(" · ");

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={`Progress ${pct}%`}
          title={summary}
          className={`flex min-w-24 flex-1 overflow-hidden rounded-full bg-gs-gray/15 ring-1 ring-inset ring-gs-gray/10 ${small ? "h-1.5" : "h-2.5"}`}
        >
          {total > 0 &&
            SEGMENTS.filter((s) => s.key !== "notStarted").map((s) =>
              counts[s.key] > 0 ? (
                <span
                  key={s.key}
                  className={`h-full ${s.bar} transition-[width] duration-500`}
                  style={{ width: `${(counts[s.key] / total) * 100}%` }}
                />
              ) : null,
            )}
        </div>
        <span className={`whitespace-nowrap tabular-nums ${small ? "text-xs" : "text-sm"}`}>
          <span className="font-semibold">{pct}%</span>
          <span className={`ml-1.5 text-gs-gray ${small ? "text-[11px]" : "text-xs"}`}>
            {counts.completed}/{total}
          </span>
        </span>
      </div>

      {showLegend && (
        <ul className={`flex flex-wrap text-gs-gray ${small ? "mt-1.5 gap-x-3 gap-y-0.5 text-[11px]" : "mt-2 gap-x-4 gap-y-1 text-xs"}`}>
          {SEGMENTS.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={`h-2 w-2 rounded-full ${s.dot}`} />
              <span className="tabular-nums font-medium text-gs-black">{counts[s.key]}</span> {labels[s.key]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
