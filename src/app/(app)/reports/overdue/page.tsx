import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canViewReports } from "@/lib/permissions";
import { getOverdueReport, getReportScope } from "@/lib/reports";
import { PageHeader } from "@/components/page-header";
import { Kpi, KpiStrip, ReportBreadcrumb } from "@/components/report-kpi";

export default async function OverdueReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canViewReports(user)) redirect("/");

  const { label } = getReportScope(user);
  const clusters = await getOverdueReport(user);
  const totalOverdue = clusters.reduce((s, c) => s + c.tasks.length, 0);
  const allTasks = clusters.flatMap((c) => c.tasks);
  const unassigned = allTasks.filter((t) => !t.assigneeName).length;
  const worst = allTasks.reduce((m, t) => Math.max(m, t.daysLate), 0);
  const over7 = allTasks.filter((t) => t.daysLate > 7).length;

  return (
    <div>
      <ReportBreadcrumb current="Overdue Tasks" />
      <PageHeader
        title="Overdue Tasks"
        description="Every task past its due date, grouped by cluster."
        actions={
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gs-gray shadow-sm ring-1 ring-gs-gray/15">
            {label}
          </span>
        }
      />

      <KpiStrip>
        <Kpi label="Overdue tasks" value={totalOverdue} tone={totalOverdue > 0 ? "danger" : "default"} hint={`${clusters.length} ${clusters.length === 1 ? "cluster" : "clusters"} affected`} />
        <Kpi label="More than 7 days late" value={over7} tone={over7 > 0 ? "danger" : "default"} />
        <Kpi label="Not assigned" value={unassigned} tone={unassigned > 0 ? "warn" : "default"} hint="Nobody owns these yet" />
        <Kpi label="Longest overdue" value={worst > 0 ? `${worst} day${worst === 1 ? "" : "s"}` : "—"} tone={worst > 7 ? "danger" : "default"} />
      </KpiStrip>

      {clusters.length === 0 && (
        <p className="mt-6 flex items-center gap-2 rounded-xl border border-gs-gray/10 bg-white px-5 py-6 text-sm text-gs-gray shadow-sm">
          <span aria-hidden className="text-green-600">✓</span> Nothing overdue in scope.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {clusters.map((c) => (
          <section key={c.clusterName}>
            <div className="overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm">
              <h2 className="flex items-center gap-2.5 border-b border-gs-gray/10 px-5 py-3.5 font-heading text-base font-semibold tracking-tight">
                {c.clusterName}
                <span className="rounded-full bg-gs-red/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-gs-red">{c.tasks.length}</span>
              </h2>
              <div className="table-scroll">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                    <tr>
                      <th className="whitespace-nowrap px-5 py-2.5">Task</th>
                      <th className="whitespace-nowrap px-4 py-2">Project</th>
                      <th className="whitespace-nowrap px-4 py-2">Assignee</th>
                      <th className="whitespace-nowrap px-4 py-2">Due Date</th>
                      <th className="whitespace-nowrap px-4 py-2">Days Late</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.tasks.map((t) => (
                      <tr key={t.id} className="border-t border-gs-gray/10">
                        <td className="px-5 py-3">
                          <Link href={`/projects/${t.projectId}/tasks/${t.id}`} className="font-medium hover:text-gs-red hover:underline">
                            {t.name}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <span className="block text-gs-black/80">{t.projectName}</span>
                          <span className="block text-xs text-gs-gray">{t.clientName}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          {t.assigneeName ? (
                            <span className="text-gs-gray">{t.assigneeName}</span>
                          ) : (
                            <span className="font-medium text-gs-red">Not Assigned</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-gs-gray">{t.dueDate}</td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                              t.daysLate > 7 ? "bg-gs-red text-white" : "bg-gs-red/10 text-gs-red"
                            }`}
                          >
                            {t.daysLate} day{t.daysLate === 1 ? "" : "s"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
