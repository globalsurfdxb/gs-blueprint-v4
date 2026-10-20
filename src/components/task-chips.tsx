// Small coloured chips for task status, priority and revisions — one definition so every task list
// reads the same. Colour is never the only signal: the label is always printed.

const STATUS: Record<string, { chip: string; dot: string }> = {
  NEW: { chip: "bg-gs-black/5 text-gs-black/80", dot: "bg-gs-gray" },
  IN_PROGRESS: { chip: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  REVIEW: { chip: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  REVISION: { chip: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  COMPLETED: { chip: "bg-green-50 text-green-700", dot: "bg-green-500" },
  ON_HOLD: { chip: "bg-gs-gray/15 text-gs-gray", dot: "bg-gs-gray/60" },
};

export function TaskStatusChip({ status, label }: { status: string; label: string }) {
  const s = STATUS[status] ?? STATUS.NEW;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${s.chip}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

const PRIORITY: Record<string, { text: string; dot: string }> = {
  URGENT: { text: "text-gs-red", dot: "bg-gs-red" },
  HIGH: { text: "text-amber-700", dot: "bg-amber-500" },
  MEDIUM: { text: "text-gs-black/80", dot: "bg-sky-500" },
  LOW: { text: "text-gs-gray", dot: "bg-gs-gray/50" },
};

export function PriorityPill({ priority }: { priority: string }) {
  const p = PRIORITY[priority] ?? PRIORITY.MEDIUM;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${p.text}`}>
      <span aria-hidden className={`h-2 w-2 rounded-full ${p.dot}`} />
      {priority.charAt(0) + priority.slice(1).toLowerCase()}
    </span>
  );
}

/** Revisions count as a compact badge: quiet at 0, amber at 1, red at 2+ (matches the dashboard rule). */
export function RevisionBadge({ count }: { count: number }) {
  const tone =
    count >= 2 ? "bg-gs-red/10 text-gs-red" : count === 1 ? "bg-amber-100 text-amber-700" : "bg-gs-black/5 text-gs-gray";
  return (
    <span className={`inline-flex min-w-6 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${tone}`}>
      {count}
    </span>
  );
}
