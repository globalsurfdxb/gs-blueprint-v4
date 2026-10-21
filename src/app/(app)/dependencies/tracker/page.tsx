import Link from "next/link";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocalDateString } from "@/lib/timezone";
import {
  dueRange,
  loadActiveTrackerRows,
  filterTrackerRows,
  ACTIVE_STATUSES,
  STATUS_LABELS,
} from "@/lib/dependency-data";
import { DependencyProjectGroups } from "@/components/dependency-project-groups";
import { PageHeader } from "@/components/page-header";
import { Select } from "@/components/select";

/**
 * Dependency Tracker list — the filterable ACTIVE cross-department queue for a view-only
 * coordinator (PRD 8.13). The summary figures live on the Dashboard (/dependencies); this screen
 * is where the coordinator drills in. Completed work is excluded here — the Projects tab shows
 * the full history including Completed.
 *
 * Filters: project, status (active only), due date (This week / This month / Custom), and
 * Overdue. Dashboard tiles deep-link here with the matching filter pre-applied.
 */
export default async function DependencyTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    due?: string;
    from?: string;
    to?: string;
    status?: string;
    overdue?: string;
    discipline?: string;
    stuck?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const {
    project: projectParam = "",
    due = "",
    from,
    to,
    status = "",
    overdue = "",
    discipline = "",
    stuck = "",
  } = await searchParams;

  const now = new Date();
  const todayStr = getLocalDateString(user.location, now);
  const range = dueRange(due, from, to, todayStr);
  // Only active statuses are valid here — Completed lives on the Projects tab.
  const validStatus = (ACTIVE_STATUSES as readonly string[]).includes(status) ? status : null;
  const overdueOn = overdue === "1";
  const stuckOn = stuck === "1";

  const [projectOptions, rows] = await Promise.all([
    prisma.project.findMany({
      where: { dependencyTrackerId: user.id, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    loadActiveTrackerRows(user.id, user.location, now),
  ]);

  const groups = filterTrackerRows(rows, {
    projectId: projectParam || undefined,
    status: validStatus,
    range,
    overdue: overdueOn,
    discipline: discipline || undefined,
    stuck: stuckOn,
  });

  const anyFilter =
    projectParam !== "" || due !== "" || validStatus !== null || overdueOn || discipline !== "" || stuckOn;

  return (
    <div>
      <p className="text-sm text-gs-gray">
        <Link href="/dependencies" className="hover:underline">Dashboard</Link>
        {" › "}Dependency Tracker
      </p>
      <PageHeader
        title="Dependency Tracker"
        description={<>
Active cross-department work on the projects you coordinate — view only. Completed items live under Projects.
</>}
        actions={<>
          <Link href="/dependencies/projects" className="text-sm font-medium text-gs-red hover:underline">Browse by project →</Link>
        </>}
      />

      <AutoFilterForm className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-gs-gray/15 bg-white p-3">
        {/* Preserve deep-link filters across a manual form submit so filters compose. */}
        {discipline && <input type="hidden" name="discipline" value={discipline} />}
        {stuckOn && <input type="hidden" name="stuck" value="1" />}
        <div className="flex flex-col gap-1">
          <label htmlFor="project" className="text-xs font-medium text-gs-gray">Project</label>
          <Select id="project" name="project" defaultValue={projectParam} className="field field-sm">
            <option value="">All projects</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs font-medium text-gs-gray">Status</label>
          <Select id="status" name="status" defaultValue={validStatus ?? ""} className="field field-sm">
            <option value="">Any active</option>
            {ACTIVE_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="due" className="text-xs font-medium text-gs-gray">Due</label>
          <Select id="due" name="due" defaultValue={due} className="field field-sm">
            <option value="">Any time</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="custom">Custom range</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-xs font-medium text-gs-gray">From</label>
          <input id="from" type="date" name="from" defaultValue={from ?? ""} className="field field-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-xs font-medium text-gs-gray">To</label>
          <input id="to" type="date" name="to" defaultValue={to ?? ""} className="field field-sm" />
        </div>
        <label className="flex min-h-9 items-center gap-2 text-sm text-gs-gray">
          <input type="checkbox" name="overdue" value="1" defaultChecked={overdueOn} className="h-4 w-4 rounded border-gs-gray/40" />
          Overdue only
        </label>
        {anyFilter && (
          <Link href="/dependencies/tracker" className="flex min-h-9 items-center px-2 text-sm text-gs-gray hover:underline">Clear</Link>
        )}
        <p className="w-full text-xs text-gs-gray">Filters apply as you change them. From / To apply when Due is set to “Custom range”.</p>
      </AutoFilterForm>

      {(discipline || stuckOn) && (
        <p className="mt-3 text-xs text-gs-gray">
          Filtered to {stuckOn ? "stuck tasks" : `discipline: ${discipline}`}.{" "}
          <Link href="/dependencies/tracker" className="text-gs-red hover:underline">Clear</Link>
        </p>
      )}

      {groups.length === 0 ? (
        <p className="mt-6 text-sm text-gs-gray">
          {anyFilter ? "No active cross-department tasks match your filters." : "No active cross-department tasks on your assigned projects."}
        </p>
      ) : (
        <DependencyProjectGroups groups={groups} viewerLocation={user.location} orderByAppearance={overdueOn} />
      )}
    </div>
  );
}
