import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canViewReports, canViewHoursReport } from "@/lib/permissions";
import { getReportScope } from "@/lib/reports";
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
  const reports: { href: string; title: string; description: string; icon: TileIcon; tag: string; show: boolean }[] = [
    {
      href: "/reports/time-logs",
      title: "Time Logs",
      description: "Logged hours per person, filterable by client, project and time period.",
      icon: "timer" as const,
      tag: "Excel export",
      show: hours,
    },
    {
      href: "/reports/overdue",
      title: "Overdue Tasks",
      description: "Every task past its due date, grouped by cluster.",
      icon: "alert" as const,
      tag: "Oversight",
      show: oversight,
    },
    {
      href: "/reports/time-by-client",
      title: "Time by Client",
      description: "Aggregated logged hours per client — for pricing and margin reviews.",
      icon: "clock" as const,
      tag: "Oversight",
      show: oversight,
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
            <p className="mt-1 flex-1 text-sm leading-relaxed text-gs-gray">{r.description}</p>
            <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-gs-red">
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
