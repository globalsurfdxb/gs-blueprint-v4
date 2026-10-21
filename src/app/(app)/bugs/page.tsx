import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { getBugAccess } from "@/lib/bug-access";
import { ENVIRONMENT_LABELS, SEVERITY_LABELS, statusLabel } from "@/lib/bug";
import { daysOverdue } from "@/lib/timezone";
import { PageHeader } from "@/components/page-header";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { Select } from "@/components/select";
import { EmptyState, SectionCard } from "@/components/dashboard-ui";
import { TaskStatusChip } from "@/components/task-chips";
import { KanbanBoard, TaskViews, type ViewTask } from "@/components/task-views";
import { TaskDrawerProvider, TaskOpener } from "@/components/task-drawer";
import { ReportBugButton } from "@/components/report-bug-button";
import { BUG_PROGRESS_LABELS, SprintProgress } from "@/components/sprint-progress";
import type { SprintCounts } from "@/lib/sprint-dashboard";

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const SEVERITY_CHIP: Record<string, string> = {
  CRITICAL: "bg-gs-red/10 text-gs-red",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-gs-light text-gs-gray",
};
const FALLBACK_LOCATION = "DUBAI";

type SearchParams = {
  q?: string;
  project?: string;
  status?: string;
  severity?: string;
  assignee?: string;
  reopened?: string;
};

/**
 * Bugs menu: every bug on the bug-tracking teams this person works with, across projects (see
 * getBugAccess for who sees what — oversight roles see all bugs in their groups, team members see
 * the ones assigned to or reported by them). Statuses use the bug wording (Open, In Progress, Ready
 * for Retest, Reopened, Closed). The list defaults to bugs that are still open.
 */
export default async function BugsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const access = await getBugAccess(user);
  if (access.groupIds.length === 0) redirect("/");

  const loaded = await prisma.task.findMany({
    where: {
      taskType: "BUG",
      groupId: { in: access.groupIds },
      project: { archivedAt: null },
    },
    include: {
      project: { select: { id: true, name: true, client: { select: { name: true } } } },
      assignedTo: { select: { id: true, name: true, location: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  // Oversight roles see every bug in their groups; everyone else only their own.
  const all = loaded.filter(
    (b) =>
      (b.groupId !== null && access.fullViewGroupIds.has(b.groupId)) ||
      b.assignedToId === user.id ||
      b.createdById === user.id,
  );

  // ---- filter options from what this person can see ----
  const projectOptions = Array.from(new Map(all.map((b) => [b.projectId, `${b.project.name} · ${b.project.client.name}`])).entries()).sort(
    (a, b) => a[1].localeCompare(b[1]),
  );
  const assigneeOptions = Array.from(
    new Map(all.filter((b) => b.assignedTo).map((b) => [b.assignedToId as string, b.assignedTo!.name])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));
  const hasUnassigned = all.some((b) => b.assignedToId === null);

  // ---- read + validate filters ----
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const project = projectOptions.some(([id]) => id === sp.project) ? (sp.project as string) : "";
  const STATUS_VALUES = ["NEW", "IN_PROGRESS", "REVIEW", "COMPLETED", "ON_HOLD"];
  // Default to bugs that are still open; "all" shows everything including Closed.
  const status = sp.status === "all" || STATUS_VALUES.includes(sp.status ?? "") ? (sp.status as string) : "open";
  const severity = (SEVERITY_ORDER as readonly string[]).includes(sp.severity ?? "") ? (sp.severity as string) : "";
  const assignee =
    sp.assignee === "none" && hasUnassigned
      ? "none"
      : assigneeOptions.some(([id]) => id === sp.assignee)
        ? (sp.assignee as string)
        : "";
  const reopened = sp.reopened === "1";
  const anyFilter = !!(q || project || sp.status || severity || assignee || reopened);
  const needle = q.toLowerCase();
  const now = new Date();

  const filtered = all
    .filter((b) => {
      if (project && b.projectId !== project) return false;
      if (severity && b.severity !== severity) return false;
      if (assignee === "none" ? b.assignedToId !== null : assignee && b.assignedToId !== assignee) return false;
      if (reopened && b.revisionCount < 1) return false;
      if (status === "open" ? b.status === "COMPLETED" : status !== "all" && b.status !== status) return false;
      if (
        needle &&
        !b.name.toLowerCase().includes(needle) &&
        !b.project.name.toLowerCase().includes(needle) &&
        !(b.assignedTo?.name ?? "").toLowerCase().includes(needle) &&
        !b.createdBy.name.toLowerCase().includes(needle)
      ) {
        return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf((a.severity ?? "LOW") as (typeof SEVERITY_ORDER)[number]) -
          SEVERITY_ORDER.indexOf((b.severity ?? "LOW") as (typeof SEVERITY_ORDER)[number]) ||
        a.dueDate.getTime() - b.dueDate.getTime(),
    );

  // ---- summary chips over everything visible (independent of the filters) ----
  const count = (f: (b: (typeof all)[number]) => boolean) => all.filter(f).length;
  const summary = [
    { label: "Open", n: count((b) => b.status === "NEW"), tone: "" },
    { label: "In progress", n: count((b) => b.status === "IN_PROGRESS"), tone: "" },
    { label: "Ready for retest", n: count((b) => b.status === "REVIEW"), tone: count((b) => b.status === "REVIEW") > 0 ? "text-violet-600" : "" },
    { label: "Reopened before", n: count((b) => b.revisionCount > 0 && b.status !== "COMPLETED"), tone: count((b) => b.revisionCount > 0 && b.status !== "COMPLETED") > 0 ? "text-gs-red" : "" },
    { label: "Critical / high", n: count((b) => b.status !== "COMPLETED" && (b.severity === "CRITICAL" || b.severity === "HIGH")), tone: count((b) => b.status !== "COMPLETED" && (b.severity === "CRITICAL" || b.severity === "HIGH")) > 0 ? "text-gs-red" : "" },
  ];

  // List view: the filtered bugs grouped under their project (most severe first inside each).
  const projectGroups = new Map<string, { id: string; name: string; clientName: string; bugs: typeof filtered }>();
  for (const b of filtered) {
    const g = projectGroups.get(b.projectId) ?? {
      id: b.projectId,
      name: b.project.name,
      clientName: b.project.client.name,
      bugs: [],
    };
    g.bugs.push(b);
    projectGroups.set(b.projectId, g);
  }
  const byProject = Array.from(projectGroups.values()).sort(
    (x, y) => x.name.localeCompare(y.name) || x.clientName.localeCompare(y.clientName),
  );

  // Progress per project: ALL the bugs this person can see on it (not just the filtered ones), so the
  // bar always reads the project's real state — e.g. filtering to "still open" doesn't zero the Closed share.
  const bugCounts = new Map<string, SprintCounts>();
  for (const b of all) {
    const c = bugCounts.get(b.projectId) ?? { notStarted: 0, inProgress: 0, review: 0, completed: 0, total: 0 };
    c.total += 1;
    if (b.status === "COMPLETED") c.completed += 1;
    else if (b.status === "REVIEW") c.review += 1;
    else if (b.status === "IN_PROGRESS" || b.status === "REVISION") c.inProgress += 1;
    else c.notStarted += 1; // Open / On Hold
    bugCounts.set(b.projectId, c);
  }

  // Kanban / Calendar: the same filtered bugs as board cards.
  const viewTasks: ViewTask[] = filtered.map((b) => ({
    id: b.id,
    projectId: b.projectId,
    name: b.name,
    status: b.status,
    onHoldFromStatus: b.onHoldFromStatus ?? null,
    taskType: b.taskType,
    priority: b.priority,
    revisionCount: b.revisionCount,
    assigneeName: b.assignedTo?.name ?? null,
    isTimerRunning: false,
    dueKey: `${b.dueDate.getUTCFullYear()}-${String(b.dueDate.getUTCMonth() + 1).padStart(2, "0")}-${String(b.dueDate.getUTCDate()).padStart(2, "0")}`,
    dueLabel: formatDate(b.dueDate),
    projectName: b.project.name,
    projectLabel: `${b.project.name} · ${b.project.client.name}`,
    sprintId: b.sprintId ?? null,
  }));
  const todayKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  // The project's name, client, bug count, "+ Add bug" and progress — the same header on the List
  // cards and on the per-project Kanban boards, so a project is always identifiable.
  const projectHeader = (g: (typeof byProject)[number]) => (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gs-gray/10 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-semibold">{g.name}</h2>
                      <span className="text-sm text-gs-gray">{g.clientName}</span>
                      <span className="rounded-full bg-gs-light px-2 py-0.5 text-xs font-semibold tabular-nums text-gs-gray">
                        {g.bugs.length} {g.bugs.length === 1 ? "bug" : "bugs"}
                      </span>
                    </div>
                    <ReportBugButton projectId={g.id} label="+ Add bug" className="btn btn-secondary btn-sm" />
                    {bugCounts.get(g.id) && (
                      <SprintProgress
                        counts={bugCounts.get(g.id)!}
                        labels={BUG_PROGRESS_LABELS}
                        size="sm"
                        showLegend
                        className="w-full max-w-md"
                      />
                    )}
                  </header>
  );

  // Kanban: one board per project (not one mixed board), each under its own header. The cards drop
  // the project line because the header above them already says it.
  const kanbanByProject = (
    <div className="flex flex-col gap-6">
      {byProject.length === 0 ? (
        <SectionCard title="Bugs">
          <EmptyState text="No bugs match these filters." />
        </SectionCard>
      ) : (
        byProject.map((g) => (
          <section key={g.id} className="overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm">
            {projectHeader(g)}
            <div className="bg-gs-light/40 p-3 md:p-4">
              <KanbanBoard
                kind="bug"
                surfacePath="/bugs"
                tasks={viewTasks.filter((t) => t.projectId === g.id).map((t) => ({ ...t, projectLabel: undefined }))}
              />
            </div>
          </section>
        ))
      )}
    </div>
  );

  return (
    <TaskDrawerProvider>
    <div>
      <PageHeader
        title="Bugs"
        description={<>Bugs reported and fixed by your team, across every project.</>}
        actions={<ReportBugButton />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {summary.map((s) => (
          <div key={s.label} className="rounded-xl border border-gs-gray/10 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-gs-gray">{s.label}</p>
            <p className={`mt-1 font-heading text-2xl font-bold tabular-nums ${s.tone}`}>{s.n}</p>
          </div>
        ))}
      </div>

      {/* Filter bar — applies as you change it (search waits for a short pause). */}
      <AutoFilterForm className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-gs-gray/10 bg-white p-3 shadow-sm">
        <div className="flex w-full flex-col gap-1 sm:w-64">
          <label htmlFor="q" className="text-xs font-medium text-gs-gray">Search</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Bug, project or person…"
            autoComplete="off"
            className="field field-sm w-full"
          />
        </div>

        {projectOptions.length > 1 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="project" className="text-xs font-medium text-gs-gray">Project</label>
            <Select id="project" name="project" defaultValue={project} className="field field-sm min-w-48">
              <option value="">All projects</option>
              {projectOptions.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs font-medium text-gs-gray">Status</label>
          <Select id="status" name="status" defaultValue={status} className="field field-sm min-w-44">
            <option value="open">Still open (not closed)</option>
            <option value="all">All, including closed</option>
            <option value="NEW">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="REVIEW">Ready for Retest</option>
            <option value="ON_HOLD">On Hold</option>
            <option value="COMPLETED">Closed</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="severity" className="text-xs font-medium text-gs-gray">Severity</label>
          <Select id="severity" name="severity" defaultValue={severity} className="field field-sm min-w-36">
            <option value="">Any severity</option>
            {SEVERITY_ORDER.map((s) => (
              <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
            ))}
          </Select>
        </div>

        {(assigneeOptions.length > 0 || hasUnassigned) && (
          <div className="flex flex-col gap-1">
            <label htmlFor="assignee" className="text-xs font-medium text-gs-gray">Assignee</label>
            <Select id="assignee" name="assignee" defaultValue={assignee} className="field field-sm min-w-40">
              <option value="">Everyone</option>
              {hasUnassigned && <option value="none">Unassigned</option>}
              {assigneeOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
          </div>
        )}

        <label className="flex min-h-9 items-center gap-2 pb-0.5 text-sm text-gs-gray">
          <input type="checkbox" name="reopened" value="1" defaultChecked={reopened} className="h-4 w-4" />
          Reopened at least once
        </label>

        <div className="flex min-h-9 items-center gap-3 pb-0.5 text-sm text-gs-gray sm:ml-auto">
          <span>
            {filtered.length} of {all.length} {all.length === 1 ? "bug" : "bugs"}
          </span>
          {anyFilter && (
            <Link href="/bugs" className="font-medium text-gs-red hover:underline">
              Clear filters
            </Link>
          )}
        </div>
      </AutoFilterForm>

      <div className="mt-6">
        {/* List shows the bugs under their project; Kanban / Calendar show the same filtered bugs. */}
        <TaskViews
          surfacePath="/bugs"
          tasks={viewTasks}
          todayKey={todayKey}
          showFilters={false}
          kind="bug"
          kanbanView={kanbanByProject}
        >
          {filtered.length === 0 ? (
            <SectionCard title="Bugs">
              <EmptyState
                text={
                  all.length === 0
                    ? "No bugs reported yet."
                    : "No bugs match these filters. Try a broader search, or clear the filters."
                }
              />
            </SectionCard>
          ) : (
            <div className="flex flex-col gap-6">
              {byProject.map((g) => (
                <section key={g.id} className="overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm">
                  {projectHeader(g)}
                  <div className="table-scroll">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                        <tr>
                          <th className="whitespace-nowrap px-4 py-2">Bug</th>
                          <th className="whitespace-nowrap px-4 py-2">Severity</th>
                          <th className="whitespace-nowrap px-4 py-2">Status</th>
                          <th className="whitespace-nowrap px-4 py-2">Assignee</th>
                          <th className="whitespace-nowrap px-4 py-2">Reported by</th>
                          <th className="whitespace-nowrap px-4 py-2">Reopens</th>
                          <th className="whitespace-nowrap px-4 py-2">Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.bugs.map((b) => {
                          const late =
                            b.status === "COMPLETED"
                              ? null
                              : daysOverdue(b.dueDate, b.assignedTo?.location ?? FALLBACK_LOCATION, now);
                          return (
                            <tr key={b.id} className="border-t border-gs-gray/10">
                              <td className="px-4 py-2.5">
                                <TaskOpener
                                  taskId={b.id}
                                  projectId={b.projectId}
                                  className="text-left font-medium hover:text-gs-red hover:underline"
                                >
                                  {b.name}
                                </TaskOpener>
                                {b.environment && (
                                  <p className="text-xs text-gs-gray">{ENVIRONMENT_LABELS[b.environment] ?? b.environment}</p>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5">
                                {b.severity ? (
                                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_CHIP[b.severity] ?? ""}`}>
                                    {SEVERITY_LABELS[b.severity] ?? b.severity}
                                  </span>
                                ) : (
                                  <span className="text-gs-gray">—</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5">
                                <TaskStatusChip status={b.status} label={statusLabel(b.status, "BUG")} />
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5">
                                {b.assignedTo ? (
                                  <span className="text-gs-gray">{b.assignedTo.name}</span>
                                ) : (
                                  <span className="font-medium text-gs-red">Unassigned</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{b.createdBy.name}</td>
                              <td className="whitespace-nowrap px-4 py-2.5">
                                <span
                                  className={
                                    b.revisionCount >= 2
                                      ? "font-semibold text-gs-red"
                                      : b.revisionCount === 1
                                        ? "font-semibold text-amber-600"
                                        : "text-gs-gray"
                                  }
                                >
                                  {b.revisionCount}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">
                                {formatDate(b.dueDate)}
                                {late !== null && late > 0 && <span className="ml-1 text-gs-red">({late}d late)</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </TaskViews>
      </div>
    </div>
    </TaskDrawerProvider>
  );
}
