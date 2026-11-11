import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canViewHoursReport } from "@/lib/permissions";
import {
  getReportScope,
  getTimeLogFilterOptions,
  getTimeLogReport,
  type TimeLogParams,
  type TimeLogPeriod,
} from "@/lib/reports";
import { formatDuration } from "@/lib/format";
import { TimeLogsFilters } from "./time-logs-filters";
import { PageHeader } from "@/components/page-header";
import { Kpi, KpiStrip, ReportBreadcrumb } from "@/components/report-kpi";

function str(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function TimeLogsReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canViewHoursReport(user)) redirect("/");

  const sp = await searchParams;
  const periodRaw = str(sp.period);
  const period: TimeLogPeriod = (["day", "week", "month", "custom"] as const).includes(
    periodRaw as TimeLogPeriod,
  )
    ? (periodRaw as TimeLogPeriod)
    : "month";

  const params: TimeLogParams = {
    clientId: str(sp.clientId),
    projectId: str(sp.projectId),
    assigneeId: str(sp.assigneeId),
    period,
    from: str(sp.from),
    to: str(sp.to),
  };

  const { label } = getReportScope(user);
  const options = await getTimeLogFilterOptions(user);
  const report = await getTimeLogReport(user, params);

  // Excel export link — carries exactly the filters currently applied on screen, so the export
  // always matches what's shown (and the same scope, enforced server-side in the export route).
  const exportParams = new URLSearchParams();
  if (params.period) exportParams.set("period", params.period);
  if (params.clientId) exportParams.set("clientId", params.clientId);
  if (params.projectId) exportParams.set("projectId", params.projectId);
  if (params.assigneeId) exportParams.set("assigneeId", params.assigneeId);
  if (params.from) exportParams.set("from", params.from);
  if (params.to) exportParams.set("to", params.to);
  const exportHref = `/reports/time-logs/export?${exportParams.toString()}`;

  return (
    <div>
      <ReportBreadcrumb current="Time Logs" />
      <PageHeader
        title="Time Logs"
        description="Logged hours per person, filterable by client, project and period."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gs-gray shadow-sm ring-1 ring-gs-gray/15">
              {label}
            </span>
            <a href={exportHref} className="btn btn-secondary btn-sm">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">
                <path d="M10 3v10m0 0 4-4m-4 4-4-4M4 16h12" />
              </svg>
              Export to Excel
            </a>
          </div>
        }
      />

      <TimeLogsFilters clients={options.clients} projects={options.projects} assignees={options.assignees} params={params} />

      {(() => {
        const taskCount = report.groups.reduce((n, g) => n + g.tasks.length, 0);
        const people = report.groups.length;
        return (
          <KpiStrip>
            <Kpi label="Total time logged" value={formatDuration(report.grandTotalSeconds)} hint={`${{ day: "Today", week: "This Week", month: "This Month", custom: "Custom Range" }[params.period]} · ${report.fromLabel} – ${report.toLabel}`} />
            <Kpi label="People" value={people} />
            <Kpi label="Tasks worked on" value={taskCount} />
            <Kpi label="Average per person" value={people > 0 ? formatDuration(Math.round(report.grandTotalSeconds / people)) : "—"} />
          </KpiStrip>
        );
      })()}

      {report.groups.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-gs-gray/10 bg-white px-4 py-14 text-center shadow-sm">
          <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-gs-light text-gs-gray">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2 2M9 2h6" />
            </svg>
          </span>
          <p className="font-medium">No time logged</p>
          <p className="text-sm text-gs-gray">Nothing was logged in this period for the selected filters. Try a wider period.</p>
        </div>
      ) : (
        <>
          <h2 className="mt-8 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-gs-gray after:h-px after:flex-1 after:bg-gs-gray/15">
            By person
          </h2>
          <div className="mt-3 flex flex-col gap-4">
            {report.groups.map((g) => {
              const share = report.grandTotalSeconds > 0 ? Math.round((g.totalSeconds / report.grandTotalSeconds) * 100) : 0;
              return (
                <section key={g.userId} className="overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm">
                  <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gs-gray/10 px-5 py-3.5">
                    <span
                      aria-hidden
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gs-red/10 text-sm font-semibold text-gs-red"
                    >
                      {g.userName.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-heading text-base font-semibold leading-tight tracking-tight">{g.userName}</h3>
                      <p className="text-xs text-gs-gray">
                        {g.tasks.length} {g.tasks.length === 1 ? "task" : "tasks"}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                      <div className="hidden h-2 w-32 overflow-hidden rounded-full bg-gs-light sm:block" title={`${share}% of all time logged`}>
                        <div className="h-full rounded-full bg-gs-red" style={{ width: `${Math.max(share, 2)}%` }} />
                      </div>
                      <span className="w-9 text-right text-xs tabular-nums text-gs-gray">{share}%</span>
                      <span className="font-heading text-lg font-semibold tabular-nums">{formatDuration(g.totalSeconds)}</span>
                    </div>
                  </header>
                  <div className="table-scroll">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="border-b border-gs-gray/10 bg-gs-light/40 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray/80">
                        <tr>
                          <th className="whitespace-nowrap px-5 py-2.5">Task</th>
                          <th className="whitespace-nowrap px-4 py-2.5">Project</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-right">Time logged</th>
                          <th className="w-1/4 px-4 py-2.5">Of this person&apos;s time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.tasks.map((t) => {
                          const own = g.totalSeconds > 0 ? Math.round((t.totalSeconds / g.totalSeconds) * 100) : 0;
                          return (
                            <tr key={t.taskId} className="border-t border-gs-gray/10">
                              <td className="px-5 py-3">
                                <Link
                                  href={`/projects/${t.projectId}/tasks/${t.taskId}`}
                                  className="font-medium hover:text-gs-red hover:underline"
                                >
                                  {t.taskName}
                                </Link>
                              </td>
                              <td className="px-4 py-3">
                                <span className="block font-medium text-gs-black/80">{t.projectName}</span>
                                <span className="block text-xs text-gs-gray">{t.clientName}</span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{formatDuration(t.totalSeconds)}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gs-light">
                                    <div className="h-full rounded-full bg-gs-gray/50" style={{ width: `${Math.max(own, 2)}%` }} />
                                  </div>
                                  <span className="w-9 text-right text-xs tabular-nums text-gs-gray">{own}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
