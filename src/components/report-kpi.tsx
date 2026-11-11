import Link from "next/link";

/** One headline number at the top of a report. `tone` colours the figure when it needs attention. */
export function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "danger" | "warn";
}) {
  const color = tone === "danger" ? "text-gs-red" : tone === "warn" ? "text-amber-600" : "text-gs-black";
  const edge = tone === "danger" ? "bg-gs-red" : tone === "warn" ? "bg-amber-500" : "bg-gs-gray/25";
  return (
    <div className="relative overflow-hidden rounded-xl border border-gs-gray/10 bg-white px-4 py-3.5 shadow-sm">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${edge}`} />
      <p className="text-xs font-medium text-gs-gray">{label}</p>
      <p className={`mt-1 font-heading text-2xl font-bold tabular-nums tracking-tight ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-gs-gray">{hint}</p>}
    </div>
  );
}

export function KpiStrip({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

export function ReportBreadcrumb({ current }: { current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-gs-gray">
      <Link href="/reports" className="hover:text-gs-black hover:underline">
        Reports
      </Link>
      <span aria-hidden>/</span>
      <span className="font-medium text-gs-black/70">{current}</span>
    </nav>
  );
}
