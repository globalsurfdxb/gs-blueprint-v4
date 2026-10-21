import type { SprintCounts } from "@/lib/sprint-dashboard";

/** Bug counts by status for a progress bar (same bucketing as the Bugs page: On Hold counts as Open,
 * Reopened as In Progress). Counted from the bugs the viewer can see, so the bar always matches the
 * board underneath it. */
export function bugCountsOf(bugs: { status: string }[]): SprintCounts {
  const c: SprintCounts = { notStarted: 0, inProgress: 0, review: 0, completed: 0, total: 0 };
  for (const b of bugs) {
    c.total += 1;
    if (b.status === "COMPLETED") c.completed += 1;
    else if (b.status === "REVIEW") c.review += 1;
    else if (b.status === "IN_PROGRESS" || b.status === "REVISION") c.inProgress += 1;
    else c.notStarted += 1;
  }
  return c;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Where a bug sprint stands against its due date: "5 days left", "Due today", "Overdue by 2 days", or
 * "All bugs closed" once every bug in it is closed. */
export function bugSprintTiming(
  due: Date,
  counts: SprintCounts,
  now: Date,
): { label: string; tone: "ok" | "warn" | "late" | "muted" } {
  if (counts.total > 0 && counts.completed === counts.total) return { label: "All bugs closed", tone: "ok" };
  const n = Math.round((utcDay(due) - utcDay(now)) / DAY_MS);
  const plural = (k: number) => `${k} day${k === 1 ? "" : "s"}`;
  if (n < 0) return { label: `Overdue by ${plural(-n)}`, tone: "late" };
  if (n === 0) return { label: "Due today", tone: "warn" };
  return { label: `${plural(n)} left`, tone: n <= 2 ? "warn" : "ok" };
}
