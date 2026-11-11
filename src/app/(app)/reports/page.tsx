import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canViewReports, canViewHoursReport } from "@/lib/permissions";
import { getOverdueReport, getReportScope, getTimeByClientReport, getTimeLogReport } from "@/lib/reports";
import { formatDuration } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { TILE_ICONS, type TileIcon } from "@/components/dashboard-ui";

export default async function ReportsIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const oversight = canViewReports(user);
  const hours = canViewHoursReport(user);
  if (!hours && !oversight) redirect("/");

  const { label } = getReportScope(user);

  // Time Logs (hours) is available to every delivery role — Contributor (own hours), Lead
  // (their team), Cluster Head, Admin — and to Account Managers (their cluster). The other two
  // are oversight-only.
  // A live headline per report, so the index already answers "how are we doing?" before anything is opened.
  const [monthLogs, overdue, byClient] = await Promise.all([
    hours ? getTimeLogReport(user, { clientId: "", projectId: "", assigneeId: "", period: "month", from: "", to: "" }) : null,
    oversight ? getOverdueReport(user) : null,
    oversight ? getTimeByClientReport(user) : null,
  ]);
  const overdueCount = overdue ? overdue.reduce((n, c) => n + c.tasks.length, 0) : 0;
  const topClient = byClient?.reduce<(typeof byClient)[number] | null>((m, r) => (!m || r.totalSeconds > m.totalSeconds ? r : m), null);

  const reports: { href: string; title: string; description: string; icon: TileIcon; tag: string; show: boolean; stat?: { value: string; label: string; danger?: boolean } }[] = [
    {
      href: "/reports/time-logs",
      title: "Time Logs",
      description: "Logged hours per person, filterable by client, project and time period.",
      icon: "timer" as const,
      tag: "Excel export",
      show: hours,
      stat: monthLogs ? { value: formatDuration(monthLogs.grandTotalSeconds), label: "logged this month" } : undefined,
    },
    {
      href: "/reports/overdue",
      title: "Overdue Tasks",
      description: "Every task past its due date, grouped by cluster.",
      icon: "alert" as const,
      tag: "Oversight",
      show: oversight,
      stat: overdue ? { value: String(overdueCount), label: overdueCount === 1 ? "task overdue" : "tasks overdue", danger: overdueCount > 0 } : undefined,
    },
    {
      href: "/reports/time-by-client",
      title: "Time by Client",
      description: "Aggregated logged hours per client — for pricing and margin reviews.",
      icon: "clock" as const,
      tag: "Oversight",
      show: oversight,
      stat: byClient ? { value: topClient && topClient.totalSeconds > 0 ? topClient.clientName : "—", label: "most time logged" } : undefined,
    },
  ].filter((r) => r.show);

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Internal reporting — not formatted for client sharing."
        actions={
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gs-gray shadow-sm ring-1 ring-gs-gray/15">
            {label}
          </span>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="group flex flex-col rounded-xl border border-gs-gray/10 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-gs-gray/25 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-gs-red/10 text-gs-red">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  {TILE_ICONS[r.icon]}
                </svg>
              </span>
              <span className="rounded-full bg-gs-light px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                {r.tag}
              </span>
            </div>
            <h2 className="mt-4 font-heading text-base font-semibold tracking-tight">{r.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-gs-gray">{r.description}</p>
            {r.stat && (
              <div className="mt-4 flex-1 rounded-lg bg-gs-light/70 px-3.5 py-2.5">
                <p className={`truncate font-heading text-xl font-bold tabular-nums tracking-tight ${r.stat.danger ? "text-gs-red" : "text-gs-black"}`}>
                  {r.stat.value}
                </p>
                <p className="text-xs text-gs-gray">{r.stat.label}</p>
              </div>
            )}
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-gs-red">
              Open report
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-6 flex items-start gap-2 rounded-xl bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-800">
        <span aria-hidden className="font-semibold">ⓘ</span>
        <span>
          The Core Project/Task Report — task chain, time logged, and revision count per stage — opens from each
          project&apos;s own page.
        </span>
      </p>
    </div>
  );
}
