import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canViewReports, canViewHoursReport } from "@/lib/permissions";
import { getReportScope } from "@/lib/reports";
import { PageHeader } from "@/components/page-header";

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
  const reports = [
    {
      href: "/reports/time-logs",
      title: "Time Logs",
      description: "Logged hours per person, filterable by project and time period.",
      show: hours,
    },
    {
      href: "/reports/overdue",
      title: "Overdue Tasks",
      description: "Every task past its due date, grouped by cluster.",
      show: oversight,
    },
    {
      href: "/reports/time-by-client",
      title: "Time by Client",
      description: "Aggregated logged hours per client — for pricing and margin reviews.",
      show: oversight,
    },
  ].filter((r) => r.show);

  return (
    <div className="page-md">
      <PageHeader
        title="Reports"
        description={<>
Internal reporting — not formatted for client sharing. Excel &amp; PDF export arrives in a later release.
</>}
        actions={<>
          <span className="text-sm text-gs-gray">{label}</span>
        </>}
      />

      <div className="mt-6 flex flex-col gap-3">
        {reports.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="rounded-lg border border-gs-gray/15 bg-white p-4 hover:bg-gs-light"
          >
            <p className="font-semibold">{r.title}</p>
            <p className="mt-1 text-sm text-gs-gray">{r.description}</p>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-xs text-gs-gray">
        The Core Project/Task Report — task chain, time logged, and revision count per stage — opens from each
        project&apos;s own page.
      </p>
    </div>
  );
}
