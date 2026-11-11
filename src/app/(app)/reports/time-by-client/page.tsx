import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canViewReports } from "@/lib/permissions";
import { getTimeByClientReport, getReportScope } from "@/lib/reports";
import { formatDuration } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Kpi, KpiStrip, ReportBreadcrumb } from "@/components/report-kpi";

export default async function TimeByClientReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canViewReports(user)) redirect("/");

  const { label } = getReportScope(user);
  const rows = await getTimeByClientReport(user);
  const grandTotal = rows.reduce((s, r) => s + r.totalSeconds, 0);
  const totalProjects = rows.reduce((s, r) => s + r.projectCount, 0);
  const top = rows.reduce<(typeof rows)[number] | null>((m, r) => (!m || r.totalSeconds > m.totalSeconds ? r : m), null);

  return (
    <div>
      <ReportBreadcrumb current="Time by Client" />
      <PageHeader
        title="Time by Client"
        description="Aggregated logged hours per client — for pricing and margin reviews."
        actions={
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gs-gray shadow-sm ring-1 ring-gs-gray/15">
            {label}
          </span>
        }
      />

      <KpiStrip>
        <Kpi label="Total time logged" value={formatDuration(grandTotal)} />
        <Kpi label="Clients" value={rows.length} />
        <Kpi label="Projects" value={totalProjects} />
        <Kpi label="Most time" value={top && top.totalSeconds > 0 ? top.clientName : "—"} hint={top && top.totalSeconds > 0 ? formatDuration(top.totalSeconds) : undefined} />
      </KpiStrip>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-gs-gray">No projects in scope yet.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm">
          <div className="table-scroll">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2">Client</th>
                  <th className="whitespace-nowrap px-4 py-2">Projects</th>
                  <th className="whitespace-nowrap px-4 py-2">Time Logged</th>
                  <th className="w-1/3 px-4 py-2">Share of total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.clientId} className="border-t border-gs-gray/10">
                    <td className="px-4 py-2 font-medium">{r.clientName}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-gs-gray">{r.projectCount}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-gs-gray">
                      {r.totalSeconds > 0 ? formatDuration(r.totalSeconds) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {grandTotal > 0 && r.totalSeconds > 0 ? (
                        <div className="flex items-center gap-2.5">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gs-light">
                            <div className="h-full rounded-full bg-gs-red" style={{ width: `${Math.max(2, Math.round((r.totalSeconds / grandTotal) * 100))}%` }} />
                          </div>
                          <span className="w-10 text-right text-xs tabular-nums text-gs-gray">{Math.round((r.totalSeconds / grandTotal) * 100)}%</span>
                        </div>
                      ) : (
                        <span className="text-gs-gray/60">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-gs-gray/15 bg-gs-light/50">
                  <td className="px-4 py-2 text-xs font-semibold uppercase text-gs-gray">Total</td>
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2 font-medium">{formatDuration(grandTotal)}</td>
                  <td className="px-4 py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
