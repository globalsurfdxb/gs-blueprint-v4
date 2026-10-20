import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canViewReports } from "@/lib/permissions";
import { getOverdueReport, getReportScope } from "@/lib/reports";
import { PageHeader } from "@/components/page-header";

export default async function OverdueReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canViewReports(user)) redirect("/");

  const { label } = getReportScope(user);
  const clusters = await getOverdueReport(user);
  const totalOverdue = clusters.reduce((s, c) => s + c.tasks.length, 0);

  return (
    <div>
      <p className="text-sm text-gs-gray">
        <Link href="/reports" className="hover:underline">
          Reports
        </Link>
      </p>
      <PageHeader
        title="Overdue Tasks"
        actions={<>
          <span className="text-sm text-gs-gray">
          {label} · {totalOverdue} overdue
        </span>
        </>}
      />

      {clusters.length === 0 && <p className="mt-6 text-sm text-gs-gray">Nothing overdue in scope.</p>}

      <div className="mt-6 flex flex-col gap-6">
        {clusters.map((c) => (
          <section key={c.clusterName}>
            <h2 className="text-sm font-semibold uppercase text-gs-gray">
              {c.clusterName} <span className="text-gs-gray/70">· {c.tasks.length}</span>
            </h2>
            <div className="mt-2 overflow-hidden rounded-lg border border-gs-gray/15 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-2">Task</th>
                      <th className="whitespace-nowrap px-4 py-2">Project</th>
                      <th className="whitespace-nowrap px-4 py-2">Assignee</th>
                      <th className="whitespace-nowrap px-4 py-2">Due Date</th>
                      <th className="whitespace-nowrap px-4 py-2">Days Late</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.tasks.map((t) => (
                      <tr key={t.id} className="border-t border-gs-gray/10">
                        <td className="px-4 py-2">
                          <Link href={`/projects/${t.projectId}/tasks/${t.id}`} className="font-medium hover:underline">
                            {t.name}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-gs-gray">{t.projectName}</td>
                        <td className="whitespace-nowrap px-4 py-2">
                          {t.assigneeName ? (
                            <span className="text-gs-gray">{t.assigneeName}</span>
                          ) : (
                            <span className="font-medium text-gs-red">Not Assigned</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-gs-gray">{t.dueDate}</td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <span className="font-medium text-gs-red">
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
