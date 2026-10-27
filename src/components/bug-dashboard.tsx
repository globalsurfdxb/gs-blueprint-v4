import Link from "next/link";
import { EmptyState, ProjectLabel, SectionCard, StatCard } from "@/components/dashboard-ui";
import { BUG_PROGRESS_LABELS, SprintProgress } from "@/components/sprint-progress";
import { SEVERITY_LABELS } from "@/lib/bug";
import type { BugDashboardData } from "@/lib/bug-dashboard";

const TIMING_TONE: Record<string, string> = {
  ok: "text-green-700",
  warn: "text-amber-600",
  late: "text-gs-red",
  muted: "text-gs-gray",
};

/**
 * The Bugs part of a dashboard: how many bugs are in each state, the bug sprints with their progress
 * and due dates, and what is overdue. Rendered only when the viewer has a Bug-Tracking team in scope,
 * so every other dashboard is unchanged.
 */
export function BugDashboardSection({ data }: { data: BugDashboardData }) {
  if (!data.hasBugs) return null;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-gs-gray after:h-px after:flex-1 after:bg-gs-gray/15">Bugs</h2>
        <Link href="/bugs" className="text-sm font-medium text-gs-red hover:underline">
          Open Bugs →
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard icon="list" label="Open Bugs" value={data.open} href="/bugs?status=NEW" />
        <StatCard icon="timer" label="In Progress" value={data.inProgress} href="/bugs?status=IN_PROGRESS" />
        <StatCard
          icon="clock"
          attention
          label="Ready for Retest"
          value={data.readyForRetest}
          tone={data.readyForRetest > 0 ? "warn" : "default"}
          href="/bugs?status=REVIEW"
        />
        <StatCard
          icon="revision"
          attention
          label="Reopened"
          value={data.reopened}
          tone={data.reopened > 0 ? "warn" : "default"}
          href="/bugs?reopened=1"
        />
        <StatCard
          icon="alert"
          attention
          label="Critical / High"
          value={data.criticalHigh}
          tone={data.criticalHigh > 0 ? "danger" : "default"}
          href="/bugs"
        />
        <StatCard
          icon="flag"
          attention
          label="Overdue Bugs"
          value={data.overdue}
          tone={data.overdue > 0 ? "danger" : "default"}
          href="/bugs"
        />
      </div>

      <div className="mt-6 grid items-start gap-6">
        <SectionCard title="Bug Sprints" count={data.sprints.length}>
          {data.sprints.length === 0 ? (
            <EmptyState text="No bug sprints yet — create one from a project's Bugs tab." />
          ) : (
            <ul className="max-h-[26rem] divide-y divide-gs-gray/10 overflow-y-auto">
              {data.sprints.map((sp) => (
                <li key={sp.id}>
                  <Link
                    href={`/projects/${sp.projectId}?tab=bugs&bugSprint=${sp.id}`}
                    title="Open this bug sprint"
                    className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 transition-colors hover:bg-gs-light/60"
                  >
                    <span className="min-w-0 flex-1 basis-48">
                      <span className="block text-[15px] font-semibold leading-snug">{sp.name}</span>
                      <span className="block text-xs text-gs-gray">
                        {sp.projectName} · {sp.clientName}
                      </span>
                    </span>
                    <span className="basis-36 text-xs">
                      <span className="block text-gs-gray">Due {sp.dueLabel}</span>
                      <span className={`block font-medium ${TIMING_TONE[sp.timingTone]}`}>{sp.timingLabel}</span>
                    </span>
                    <span className="w-16 text-xs tabular-nums text-gs-gray">
                      {sp.counts.total} {sp.counts.total === 1 ? "bug" : "bugs"}
                    </span>
                    <SprintProgress counts={sp.counts} labels={BUG_PROGRESS_LABELS} size="sm" className="w-full sm:w-56" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Overdue Bugs" count={data.overdueBugs.length}>
          {data.overdueBugs.length === 0 ? (
            <EmptyState text="No overdue bugs." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2">Bug</th>
                    <th className="whitespace-nowrap px-4 py-2">Project</th>
                    <th className="whitespace-nowrap px-4 py-2">Severity</th>
                    <th className="whitespace-nowrap px-4 py-2">Assignee</th>
                    <th className="whitespace-nowrap px-4 py-2">Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.overdueBugs.map((b) => (
                    <tr key={b.id} className="border-t border-gs-gray/10">
                      <td className="px-4 py-2.5">
                        <Link href={`/projects/${b.projectId}/tasks/${b.id}`} className="font-medium hover:underline">
                          {b.name}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <ProjectLabel name={b.projectName} client={b.clientName} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">
                        {b.severity ? (SEVERITY_LABELS[b.severity] ?? b.severity) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {b.assigneeName ? (
                          <span className="text-gs-gray">{b.assigneeName}</span>
                        ) : (
                          <span className="font-medium text-gs-red">Not Assigned</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">
                        {b.dueLabel}
                        <span className="ml-1 text-gs-red">
                          ({b.daysLate} day{b.daysLate === 1 ? "" : "s"})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </section>
  );
}
