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
import { TaskRow } from "@/components/task-row";
import { BUG_PROGRESS_LABELS, SprintProgress } from "@/components/sprint-progress";
import type { SprintCounts } from "@/lib/sprint-dashboard";
import { bugCountsOf, bugSprintTiming } from "@/lib/bug-sprints";

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
  bugSprint?: string;
  show?: string;
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
      bugSprint: { select: { id: true, name: true, dueDate: true } },
    },
  });

  // Oversight roles see every bug in their groups; everyone else only their own.
  const all = loaded.filter(
    (b) =>
      (b.groupId !== null && access.fullViewGroupIds.has(b.groupId)) ||
      b.assignedToId === user.id ||
      b.createdById === user.id,
  );

  // Bug sprints of every project this person has bug access on — including ones with no bug in them yet.
  const accessGroups = await prisma.taskGroup.findMany({ where: { id: { in: access.groupIds } }, select: { id: true, projectId: true } });
  const accessProjectIds = Array.from(new Set(accessGroups.map((g) => g.projectId)));
  // Projects where this person sees every bug (oversight) — they see all of its bug sprints. Anyone else only
  // sees bug sprints that hold a bug of theirs.
  const fullViewProjectIds = new Set(accessGroups.filter((g) => access.fullViewGroupIds.has(g.id)).map((g) => g.projectId));
  const bugSprintsRaw = await prisma.bugSprint.findMany({
    where: { projectId: { in: accessProjectIds }, project: { archivedAt: null } },
    include: { project: { select: { id: true, name: true, client: { select: { name: true } } } } },
    orderBy: [{ dueDate: "asc" }, { name: "asc" }],
  });

  const allBugSprints = bugSprintsRaw.filter((sp) => fullViewProjectIds.has(sp.projectId) || all.some((b) => b.bugSprintId === sp.id));

  // ---- filter options from what this person can see ----
  // Every project this person has bug access on — not just those that already have a bug they can see —
  // so a project with only a bug sprint (or nothing yet) can still be picked.
  const accessProjects = await prisma.project.findMany({
    where: { id: { in: accessProjectIds }, archivedAt: null },
    select: { id: true, name: true, client: { select: { name: true } } },
  });
  const projectOptions = accessProjects
    .map((pr) => [pr.id, `${pr.name} · ${pr.client.name}`] as [string, string])
    .sort((a, b) => a[1].localeCompare(b[1]));
  const assigneeOptions = Array.from(
    new Map(all.filter((b) => b.assignedTo).map((b) => [b.assignedToId as string, b.assignedTo!.name])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));
  const hasUnassigned = all.some((b) => b.assignedToId === null);
  // Bug sprints (category + due date) — named per project, so the label carries the project when
  // more than one project's sprints are in play.
  const multiProject = projectOptions.length > 1;
  const bugSprintOptions = Array.from(
    new Map(allBugSprints.map((sp) => [sp.id, multiProject || accessProjectIds.length > 1 ? `${sp.name} · ${sp.project.name}` : sp.name])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));
  const hasNoBugSprint = all.some((b) => b.bugSprintId === null);

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
  const bugSprintFilter =
    sp.bugSprint === "none" && hasNoBugSprint
      ? "none"
      : bugSprintOptions.some(([id]) => id === sp.bugSprint)
        ? (sp.bugSprint as string)
        : "";
  const reopened = sp.reopened === "1";
  // What to list: bugs and their bug sprints together (default), just the bugs, or just the bug sprints.
  const show = sp.show === "bugs" || sp.show === "sprints" ? sp.show : "all";
  const dataFilter = !!(q || project || (sp.status && sp.status !== "open") || severity || assignee || bugSprintFilter || reopened);
  const anyFilter = dataFilter || show !== "all";
  const needle = q.toLowerCase();
  const now = new Date();

  const filtered = all
    .filter((b) => {
      if (project && b.projectId !== project) return false;
      if (severity && b.severity !== severity) return false;
      if (assignee === "none" ? b.assignedToId !== null : assignee && b.assignedToId !== assignee) return false;
      if (bugSprintFilter === "none" ? b.bugSprintId !== null : bugSprintFilter && b.bugSprintId !== bugSprintFilter) return false;
      if (reopened && b.revisionCount < 1) return false;
      if (status === "open" ? b.status === "COMPLETED" : status !== "all" && b.status !== status) return false;
      if (
        needle &&
        !b.name.toLowerCase().includes(needle) &&
        !b.project.name.toLowerCase().includes(needle) &&
        !(b.assignedTo?.name ?? "").toLowerCase().includes(needle) &&
        !(b.bugSprint?.name ?? "").toLowerCase().includes(needle) &&
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
  // Bug sprints listed under their project (narrowed by the Project / Bug sprint filters).
  const visibleBugSprints = allBugSprints.filter(
    (sp) =>
      (!project || sp.projectId === project) &&
      (!bugSprintFilter || bugSprintFilter === "none" || sp.id === bugSprintFilter),
  );
  if (show === "sprints") {
    // Bug sprints only: a card for every project that has one, whatever its bugs.
    projectGroups.clear();
    for (const sp of visibleBugSprints) {
      if (!projectGroups.has(sp.projectId)) {
        projectGroups.set(sp.projectId, {
          id: sp.projectId,
          name: sp.project.name,
          clientName: sp.project.client.name,
          bugs: filtered.filter((b) => b.projectId === sp.projectId),
        });
      }
    }
  } else if (!dataFilter && show === "all") {
    // A project with a bug sprint but no bug yet still gets its card.
    for (const sp of visibleBugSprints) {
      if (!projectGroups.has(sp.projectId)) {
        projectGroups.set(sp.projectId, { id: sp.projectId, name: sp.project.name, clientName: sp.project.client.name, bugs: [] });
      }
    }
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
    createdByName: b.createdBy.name,
    projectName: b.project.name,
    projectLabel: `${b.project.name} · ${b.project.client.name}`,
    sprintId: b.sprintId ?? null,
  }));
  const todayKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  // A project's bug sprints as their own labelled block under its header: one clickable row per bug
  // sprint (name, due date and timing, bug count, progress) that opens it in the project.
  const TIMING_TONE: Record<string, string> = { ok: "text-green-700", warn: "text-amber-600", late: "text-gs-red", muted: "text-gs-gray" };
  const projectSprintBlock = (projectId: string) => {
    if (show === "bugs") return null;
    const mine = visibleBugSprints.filter((sp) => sp.projectId === projectId);
    if (mine.length === 0) return null;
    return (
      <div className="border-b border-gs-gray/10">
        <p className="bg-gs-light/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
          Bug sprints · {mine.length}
        </p>
        <ul className="max-h-72 divide-y divide-gs-gray/10 overflow-y-auto">
          {mine.map((sp) => {
            const counts = bugCountsOf(all.filter((b) => b.bugSprintId === sp.id));
            const timing = bugSprintTiming(sp.dueDate, counts, now);
            return (
              <li key={sp.id}>
                <Link
                  href={`/projects/${sp.projectId}?tab=bugs&bugSprint=${sp.id}`}
                  title="Open this bug sprint"
                  className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 transition-colors hover:bg-gs-light/60"
                >
                  <span className="min-w-0 flex-1 basis-44 text-[15px] font-semibold leading-snug">{sp.name}</span>
                  <span className="basis-36 text-xs">
                    <span className="block text-gs-gray">Due {formatDate(sp.dueDate)}</span>
                    <span className={`block font-medium ${TIMING_TONE[timing.tone]}`}>{timing.label}</span>
                  </span>
                  <span className="w-16 text-xs tabular-nums text-gs-gray">
                    {counts.total} {counts.total === 1 ? "bug" : "bugs"}
                  </span>
                  <SprintProgress counts={counts} labels={BUG_PROGRESS_LABELS} size="sm" className="w-full sm:w-56" />
                  <span aria-hidden className="hidden text-lg leading-none text-gs-gray sm:block">›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  // The project's name, client, bug count, "+ Add bug" and progress — the same header on the List
  // cards and on the per-project Kanban boards, so a project is always identifiable.
  const projectHeader = (g: (typeof byProject)[number]) => {
    const sprintBlock = projectSprintBlock(g.id);
    return (
    <>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gs-gray/10 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-semibold">
                        <Link
                          href={`/projects/${g.id}?tab=bugs`}
                          title="Open this project's Bugs tab"
                          className="hover:text-gs-red hover:underline"
                        >
                          {g.name}
                        </Link>
                      </h2>
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
    {sprintBlock}
    {sprintBlock && show === "all" && g.bugs.length > 0 && (
      <p className="border-b border-gs-gray/10 bg-gs-light/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
        Bugs · {g.bugs.length}
      </p>
    )}
    </>
    );
  };

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
            {g.bugs.length > 0 && (
              <div className="bg-gs-light/40 p-3 md:p-4">
                <KanbanBoard
                  kind="bug"
                  surfacePath="/bugs"
                  tasks={viewTasks.filter((t) => t.projectId === g.id).map((t) => ({ ...t, projectLabel: undefined }))}
                />
              </div>
            )}
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
          <div key={s.label} className="relative overflow-hidden rounded-xl border border-gs-gray/10 bg-white px-4 py-3.5 shadow-sm">
            <span
              aria-hidden
              className={`absolute inset-y-0 left-0 w-1 ${
                s.tone.includes("red") ? "bg-gs-red" : s.tone.includes("violet") ? "bg-violet-500" : "bg-gs-gray/25"
              }`}
            />
            <p className="text-xs font-medium text-gs-gray">{s.label}</p>
            <p className={`mt-1 font-heading text-2xl font-bold tabular-nums ${s.tone}`}>{s.n}</p>
          </div>
        ))}
      </div>

      {/* Filter bar — applies as you change it (search waits for a short pause). */}
      <AutoFilterForm className="mt-4 overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="relative w-full sm:w-80">
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gs-gray"
            >
              <circle cx="9" cy="9" r="5.5" />
              <path d="m13.5 13.5 3.5 3.5" />
            </svg>
            <label htmlFor="q" className="sr-only">Search</label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Bug, project, sprint or person…"
              autoComplete="off"
              className="field field-sm w-full pl-9"
            />
          </div>
        <div className="flex items-center gap-3 text-sm text-gs-gray">
          <span>
            {filtered.length} of {all.length} {all.length === 1 ? "bug" : "bugs"}
          </span>
          {anyFilter && (
            <Link href="/bugs" className="font-medium text-gs-red hover:underline">
              Clear filters
            </Link>
          )}
        </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-gs-gray/10 bg-gs-light/40 px-4 py-3.5 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="show" className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Show</label>
          <Select id="show" name="show" defaultValue={show} className="field field-sm w-full">
            <option value="all">Bugs &amp; bug sprints</option>
            <option value="bugs">Bugs only</option>
            <option value="sprints">Bug sprints only</option>
          </Select>
        </div>

        {projectOptions.length > 1 && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="project" className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Project</label>
            <Select id="project" name="project" defaultValue={project} className="field field-sm w-full">
              <option value="">All projects</option>
              {projectOptions.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </Select>
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="status" className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Status</label>
          <Select id="status" name="status" defaultValue={status} className="field field-sm w-full">
            <option value="open">Still open (not closed)</option>
            <option value="all">All, including closed</option>
            <option value="NEW">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="REVIEW">Ready for Retest</option>
            <option value="ON_HOLD">On Hold</option>
            <option value="COMPLETED">Closed</option>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="severity" className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Severity</label>
          <Select id="severity" name="severity" defaultValue={severity} className="field field-sm w-full">
            <option value="">Any severity</option>
            {SEVERITY_ORDER.map((s) => (
              <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
            ))}
          </Select>
        </div>

        {(assigneeOptions.length > 0 || hasUnassigned) && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="assignee" className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Assignee</label>
            <Select id="assignee" name="assignee" defaultValue={assignee} className="field field-sm w-full">
              <option value="">Everyone</option>
              {hasUnassigned && <option value="none">Unassigned</option>}
              {assigneeOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
          </div>
        )}

        {bugSprintOptions.length > 0 && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="bugSprint" className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Bug sprint</label>
            <Select id="bugSprint" name="bugSprint" defaultValue={bugSprintFilter} className="field field-sm w-full">
              <option value="">Any bug sprint</option>
              {hasNoBugSprint && <option value="none">Not in a bug sprint</option>}
              {bugSprintOptions.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </Select>
          </div>
        )}

        <label className="flex min-h-9 items-center gap-2 self-end text-sm text-gs-gray">
          <input type="checkbox" name="reopened" value="1" defaultChecked={reopened} className="h-4 w-4" />
          Reopened at least once
        </label>
        </div>
      </AutoFilterForm>

      <div className="mt-6">
        {show === "sprints" ? (
          byProject.length === 0 ? (
            <SectionCard title="Bug sprints">
              <EmptyState text="No bug sprints yet. Create one from a project's Bugs tab." />
            </SectionCard>
          ) : (
            <div className="flex flex-col gap-6">
              {byProject.map((g) => (
                <section key={g.id} className="overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm">
                  {projectHeader(g)}
                </section>
              ))}
            </div>
          )
        ) : (
        /* List shows the bugs under their project; Kanban / Calendar show the same filtered bugs. */
        <TaskViews
          surfacePath="/bugs"
          tasks={viewTasks}
          todayKey={todayKey}
          showFilters={false}
          kind="bug"
          kanbanView={kanbanByProject}
        >
          {byProject.length === 0 ? (
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
                  {g.bugs.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-gs-gray">No bugs reported on this project yet.</p>
                  ) : (
                  <div className="table-scroll">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead className="border-b border-gs-gray/10 bg-gs-light/40 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray/80">
                        <tr>
                          <th className="whitespace-nowrap px-4 py-2">Bug</th>
                          <th className="whitespace-nowrap px-4 py-2">Severity</th>
                          <th className="whitespace-nowrap px-4 py-2">Bug sprint</th>
                          <th className="whitespace-nowrap px-4 py-2">Status</th>
                          <th className="whitespace-nowrap px-4 py-2">Assignee</th>
                          <th className="whitespace-nowrap px-4 py-2">Created By</th>
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
                            <TaskRow key={b.id} taskId={b.id} projectId={b.projectId} className="border-t border-gs-gray/10">
                              <td className="px-4 py-3">
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
                              <td className="whitespace-nowrap px-4 py-3">
                                {b.severity ? (
                                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_CHIP[b.severity] ?? ""}`}>
                                    {SEVERITY_LABELS[b.severity] ?? b.severity}
                                  </span>
                                ) : (
                                  <span className="text-gs-gray">—</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                {b.bugSprint ? (
                                  <Link
                                    href={`/projects/${b.projectId}?tab=bugs`}
                                    className="font-medium hover:text-gs-red hover:underline"
                                    title="Open this project's Bugs tab"
                                  >
                                    {b.bugSprint.name}
                                    <span className="block text-xs font-normal text-gs-gray">due {formatDate(b.bugSprint.dueDate)}</span>
                                  </Link>
                                ) : (
                                  <span className="text-gs-gray">—</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                <TaskStatusChip status={b.status} label={statusLabel(b.status, "BUG")} />
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                {b.assignedTo ? (
                                  <span className="text-gs-gray">{b.assignedTo.name}</span>
                                ) : (
                                  <span className="font-medium text-gs-red">Unassigned</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-gs-gray">{b.createdBy.name}</td>
                              <td className="whitespace-nowrap px-4 py-3">
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
                              <td className="whitespace-nowrap px-4 py-3 text-gs-gray">
                                {formatDate(b.dueDate)}
                                {late !== null && late > 0 && <span className="ml-1 text-gs-red">({late}d late)</span>}
                              </td>
                            </TaskRow>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </TaskViews>
        )}
      </div>
    </div>
    </TaskDrawerProvider>
  );
}
