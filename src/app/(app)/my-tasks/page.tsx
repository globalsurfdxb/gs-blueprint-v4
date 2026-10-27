import { Fragment } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { daysOverdue, getLocalDateString, addDays } from "@/lib/timezone";
import { hasPersonalTaskList, hidesCompletedProjects } from "@/lib/permissions";
import { statusLabel } from "@/lib/bug";
import { KanbanBoard, TaskViews, type ViewTask } from "@/components/task-views";
import { TaskDrawerProvider, TaskOpener } from "@/components/task-drawer";
import { TaskRow } from "@/components/task-row";
import { NewTaskButton } from "@/components/new-task-button";
import { getCreatableProjects } from "@/lib/actions/task-create";
import { isFailure } from "@/lib/action-result";
import { PageHeader } from "@/components/page-header";
import { PriorityPill, RevisionBadge, StatusRing, TaskStatusChip } from "@/components/task-chips";
import { SprintProgress } from "@/components/sprint-progress";
import { bugCountsOf } from "@/lib/bug-sprints";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { Select } from "@/components/select";

const COMPLETED_WINDOW_DAYS = 30;

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    sprint?: string;
    q?: string;
    project?: string;
    status?: string;
    priority?: string;
    assignee?: string;
    due?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Account Managers have no personal task list (see hasPersonalTaskList).
  if (!hasPersonalTaskList(user)) redirect("/projects");

  const sp = await searchParams;
  const sprintParam = sp.sprint ?? "";

  const now = new Date();

  // Due-date buckets, computed in the user's own calendar day (same rule as overdue/due-tomorrow,
  // PRD 9.5). Defined up here because the Due filter below uses them too.
  const todayStr = getLocalDateString(user.location, now);
  const tomorrowStr = addDays(todayStr, 1);
  const dowSun0 = new Date(`${todayStr}T00:00:00Z`).getUTCDay(); // 0=Sun … 6=Sat
  const sundayStr = addDays(todayStr, (7 - dowSun0) % 7); // Sunday ending this week (today if Sun)
  const dueBucketOf = (dueDate: Date | null): "overdue" | "today" | "tomorrow" | "week" | "later" | "none" => {
    if (!dueDate) return "none";
    const d = dueDate.toISOString().slice(0, 10);
    if (d < todayStr) return "overdue";
    if (d === todayStr) return "today";
    if (d === tomorrowStr) return "tomorrow";
    if (d <= sundayStr) return "week";
    return "later";
  };
  // Completed work stays visible for a while so the Kanban "Completed" column and the list aren't
  // empty (QA A-04, D-04): everything open, plus anything completed in the last 30 days.
  const completedSince = new Date(now.getTime() - COMPLETED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const meId = user.id;
  // My Tasks = tasks assigned to me PLUS tasks I created (even when handed to someone else — shown with an
  // "Assigned to" tag so I can follow them). Bugs are managed separately, on the Bugs page.
  const allTasks = await prisma.task.findMany({
    where: {
      taskType: "STANDARD",
      AND: [
        { OR: [{ assignedToId: meId }, { createdById: meId }] },
        { OR: [{ status: { not: "COMPLETED" } }, { status: "COMPLETED", completedAt: { gte: completedSince } }] },
      ],
      project: {
        // Archived projects drop out for everyone.
        archivedAt: null,
        // Leads/Contributors don't see work under a Completed project.
        ...(hidesCompletedProjects(user) ? { status: { not: "COMPLETED" } } : {}),
      },
    },
    include: {
      project: { include: { client: true } },
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      parentTask: true,
      group: { select: { pod: { select: { sprintWorkflowEnabled: true } } } },
      sprint: { select: { id: true, name: true, status: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  // Sprint filter (PRD 8.14) — cross-project, shown only when the user has any Sprint-enabled
  // work. Options: Active Sprint, Backlog (Sprint-enabled but unsprinted), or a specific past
  // (Completed) Sprint the user has tasks in. Invisible for anyone with no Sprint-enabled tasks.
  const sprintWorkflowRelevant = allTasks.some((t) => t.group?.pod?.sprintWorkflowEnabled);
  const pastSprints = Array.from(
    new Map(
      allTasks
        .filter((t) => t.sprint?.status === "COMPLETED")
        .map((t) => [t.sprint!.id, { id: t.sprint!.id, name: t.sprint!.name }]),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));

  const validSprintFilter =
    sprintParam === "active" || sprintParam === "backlog" || pastSprints.some((s) => s.id === sprintParam)
      ? sprintParam
      : "";

  const sprintScoped = !validSprintFilter
    ? allTasks
    : allTasks.filter((t) => {
        if (validSprintFilter === "active") return t.sprint?.status === "ACTIVE";
        if (validSprintFilter === "backlog") return !!t.group?.pod?.sprintWorkflowEnabled && !t.sprintId;
        return t.sprintId === validSprintFilter;
      });

  // Tasks with a live timer, surfaced in the list (PRD 8.2.3). Only the assignee logs time,
  // so for this per-user view a task is "running" iff this user has an open timer on it.
  const runningLogs = await prisma.timeLog.findMany({
    where: { endTime: null, userId: user.id },
    select: { taskId: true },
  });
  const runningTaskIds = new Set(runningLogs.map((l) => l.taskId));

  // ---- Filter bar: search, project, status, priority, type, due. One server-side filter so the
  // List, Kanban, Calendar and By Due Date views always show exactly the same tasks. ----
  const projectOptions = Array.from(
    new Map(sprintScoped.map((t) => [t.projectId, { name: t.project.name, client: t.project.client.name }])).entries(),
  ).sort((a, b) => a[1].name.localeCompare(b[1].name) || a[1].client.localeCompare(b[1].client));
  // Assigned-to filter: "Me", or one of the people I handed a task to (only offered when there are any).
  const assigneeOptions = Array.from(
    new Map(sprintScoped.filter((t) => t.assignedToId && t.assignedToId !== meId).map((t) => [t.assignedToId as string, t.assignedTo?.name ?? "Unknown"])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));
  const STATUS_FILTERS = ["open", "completed", "NEW", "IN_PROGRESS", "REVIEW", "ON_HOLD", "running"] as const;
  const PRIORITY_FILTERS = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
  const DUE_FILTERS = ["overdue", "today", "week", "later"] as const;

  const fQ = (sp.q ?? "").trim();
  const fProject = projectOptions.some(([id]) => id === sp.project) ? (sp.project as string) : "";
  const fStatus = (STATUS_FILTERS as readonly string[]).includes(sp.status ?? "") ? (sp.status as string) : "";
  const fPriority = (PRIORITY_FILTERS as readonly string[]).includes(sp.priority ?? "") ? (sp.priority as string) : "";
  const fAssignee = sp.assignee === "me" || assigneeOptions.some(([id]) => id === sp.assignee) ? (sp.assignee as string) : "";
  const fDue = (DUE_FILTERS as readonly string[]).includes(sp.due ?? "") ? (sp.due as string) : "";
  const anyFilter = !!(validSprintFilter || fQ || fProject || fStatus || fPriority || fAssignee || fDue);
  const needle = fQ.toLowerCase();

  const tasks = sprintScoped.filter((t) => {
    if (fProject && t.projectId !== fProject) return false;
    if (fPriority && t.priority !== fPriority) return false;
    if (fAssignee === "me" ? t.assignedToId !== meId : fAssignee && t.assignedToId !== fAssignee) return false;
    if (fStatus === "open" && t.status === "COMPLETED") return false;
    if (fStatus === "completed" && t.status !== "COMPLETED") return false;
    if (fStatus === "running" && !runningTaskIds.has(t.id)) return false;
    if (["NEW", "IN_PROGRESS", "REVIEW", "ON_HOLD"].includes(fStatus) && t.status !== fStatus) return false;
    if (fDue) {
      if (t.status === "COMPLETED") return false; // due buckets are about work still to do
      const b = dueBucketOf(t.dueDate);
      // "This week" here means the rest of the week, tomorrow included.
      if (fDue === "week" ? b !== "week" && b !== "tomorrow" : b !== fDue) return false;
    }
    if (needle && !t.name.toLowerCase().includes(needle) && !t.project.name.toLowerCase().includes(needle)) {
      return false;
    }
    return true;
  });

  // Flat task set for the Kanban/Calendar renderings — the exact same tasks the list shows
  // (already scoped to this user's own assignments; switching view never widens that). dueKey
  // uses the UTC calendar components, matching what formatDate displays.
  const viewTasks: ViewTask[] = tasks.map((t) => ({
    id: t.id,
    projectId: t.projectId,
    name: t.name,
    status: t.status,
    onHoldFromStatus: t.onHoldFromStatus ?? null,
    taskType: t.taskType,
    priority: t.priority,
    revisionCount: t.revisionCount,
    assigneeName: t.assignedToId === meId ? null : (t.assignedTo?.name ?? "Unassigned"),
    createdByName: t.createdById === meId ? null : t.createdBy.name,
    isTimerRunning: runningTaskIds.has(t.id),
    inActiveSprint: t.sprint?.status === "ACTIVE",
    dueKey: `${t.dueDate.getUTCFullYear()}-${String(t.dueDate.getUTCMonth() + 1).padStart(2, "0")}-${String(t.dueDate.getUTCDate()).padStart(2, "0")}`,
    dueLabel: formatDate(t.dueDate),
    // My Tasks is cross-project — show which project each card belongs to (final build).
    projectName: t.project.name,
    // Shown as its own line on each Kanban card and Calendar entry — My Tasks mixes projects.
    projectLabel: `${t.project.name} · ${t.project.client.name}`,
  }));
  const todayKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  type Row = (typeof tasks)[number];

  // Subtasks nest under their parent, never a flattened standalone row (PRD 8.2.3). Within
  // this per-user view the parent may not itself be assigned to the user — it's then shown
  // as a dimmed context row so the subtask still reads as a child, not a top-level item.
  const byProject = new Map<
    string,
    { project: Row["project"]; parents: { parent: Row; isOwn: boolean; children: Row[]; contextNote?: string }[] }
  >();

  for (const t of tasks) {
    const bucket = byProject.get(t.projectId) ?? { project: t.project, parents: [] };
    byProject.set(t.projectId, bucket);
  }

  for (const [projectId, bucket] of byProject) {
    const projectTasks = tasks.filter((t) => t.projectId === projectId);
    // Pending work first, completed after it (stable sort keeps the due-date order inside each).
    const pendingFirst = (a: Row, b: Row) => Number(a.status === "COMPLETED") - Number(b.status === "COMPLETED");
    const ownTopLevel = projectTasks.filter((t) => t.parentTaskId === null).sort(pendingFirst);
    const ownSubs = projectTasks.filter((t) => t.parentTaskId !== null).sort(pendingFirst);
    const ownTopLevelIds = new Set(ownTopLevel.map((t) => t.id));

    // Own top-level tasks, each with any of the user's own subtasks nested beneath.
    for (const parent of ownTopLevel) {
      bucket.parents.push({
        parent,
        isOwn: true,
        children: ownSubs.filter((s) => s.parentTaskId === parent.id),
      });
    }
    // Subtasks whose parent isn't the user's own → group under a dimmed context parent.
    const orphanSubs = ownSubs.filter((s) => s.parentTaskId && !ownTopLevelIds.has(s.parentTaskId));
    const contextGroups = new Map<string, Row[]>();
    for (const s of orphanSubs) {
      const arr = contextGroups.get(s.parentTaskId!) ?? [];
      arr.push(s);
      contextGroups.set(s.parentTaskId!, arr);
    }
    for (const [, children] of contextGroups) {
      // Accurate context label: the parent may be hidden here because it's the user's own
      // COMPLETED task (My Tasks excludes Completed), NOT because it belongs to someone else.
      const p = children[0].parentTask;
      const contextNote =
        p && p.assignedToId === user.id
          ? p.status === "COMPLETED"
            ? "completed"
            : "not in your active tasks"
          : "not assigned to you";
      bucket.parents.push({ parent: children[0], isOwn: false, children, contextNote });
    }
  }

  // --- Bucketed view: Overdue / Today / Tomorrow / This Week / Later / No Due Date ---
  // A personal daily-planning regroup of the SAME already-visible tasks by Due Date. "Today" is
  // the user's local calendar day (same rule as overdue/due-tomorrow, PRD 9.5); "This Week" is
  // the remaining days through the Sunday that ends the current Mon–Sun week; "Later" is beyond
  // it. Due Date is a required field, so "No Due Date" only ever appears defensively.
  type BucketKey = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";
  const BUCKETS: { key: BucketKey; label: string }[] = [
    { key: "overdue", label: "Overdue" },
    { key: "today", label: "Today" },
    { key: "tomorrow", label: "Tomorrow" },
    { key: "week", label: "This Week" },
    { key: "later", label: "Later" },
    { key: "none", label: "No Due Date" },
  ];
  function bucketOf(t: Row): BucketKey {
    return dueBucketOf(t.dueDate);
  }
  // The daily-planning buckets and the count cards are about work still to do, so completed
  // tasks (kept in the list and boards for reference) are left out of them.
  const openTasks = tasks.filter((t) => t.status !== "COMPLETED");
  const bucketed = new Map<BucketKey, Row[]>(BUCKETS.map((b) => [b.key, []]));
  for (const t of openTasks) bucketed.get(bucketOf(t))!.push(t); // already sorted by dueDate asc

  // Count cards: all open work in the chosen sprint, independent of the filter bar.
  const scopeOpen = sprintScoped.filter((t) => t.status !== "COMPLETED" && t.assignedToId === meId);
  const scopeOverdue = scopeOpen.filter((t) => bucketOf(t) === "overdue").length;
  const scopeToday = scopeOpen.filter((t) => bucketOf(t) === "today").length;

  function OverdueBadge({ dueDate, status }: { dueDate: Date; status: string }) {
    if (status === "COMPLETED") return null;
    const late = daysOverdue(dueDate, user!.location, now);
    if (late === null) return null;
    if (late < 0) return null;
    return late > 0 ? (
      <span className="ml-2 rounded-full bg-gs-red/10 px-2 py-0.5 text-[11px] font-medium text-gs-red">
        {late}d overdue
      </span>
    ) : (
      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">Today</span>
    );
  }

  function TaskCells({ t, indent }: { t: Row; indent: boolean }) {
    const done = t.status === "COMPLETED";
    return (
      <>
        <td className="px-4 py-3" style={indent ? { paddingLeft: "2rem" } : undefined}>
          <span className="inline-flex items-center">
            {indent && <span className="mr-1 text-gs-gray/50">└</span>}
            {/* Completed work reads differently from pending work at a glance (QA D-04): a green
                tick, a struck-through grey title, and a muted row. */}
            <StatusRing status={t.status} />
            <TaskOpener
              taskId={t.id}
              projectId={t.projectId}
              className={`font-medium transition-colors hover:text-gs-red ${done ? "text-gs-gray line-through decoration-gs-gray/40" : ""}`}
            >
              {t.name}
            </TaskOpener>
            {runningTaskIds.has(t.id) && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gs-red/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gs-red">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-gs-red" aria-hidden />
                Running
              </span>
            )}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-gs-gray">
          {formatDate(t.dueDate)}
          <OverdueBadge dueDate={t.dueDate} status={t.status} />
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          {t.assignedToId === meId ? (
            <span className="text-gs-gray">Me</span>
          ) : (
            <span className="font-medium" title="You created this task and handed it to someone else">
              {t.assignedTo?.name ?? "No one"}
            </span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-gs-gray">{t.createdById === meId ? "Me" : t.createdBy.name}</td>
        <td className="whitespace-nowrap px-4 py-3">
          <PriorityPill priority={t.priority} />
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          <TaskStatusChip status={t.status} label={statusLabel(t.status, t.taskType)} />
        </td>
        <td className="px-4 py-3">
          <RevisionBadge count={t.revisionCount} />
        </td>
      </>
    );
  }

  function BucketRow({ t }: { t: Row }) {
    return (
      <TaskRow taskId={t.id} projectId={t.projectId} className="border-t border-gs-gray/10">
        <td className="px-4 py-3">
          <span className="inline-flex items-center">
            <StatusRing status={t.status} />
            <TaskOpener taskId={t.id} projectId={t.projectId} className="font-medium transition-colors hover:text-gs-red">{t.name}</TaskOpener>
            {runningTaskIds.has(t.id) && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gs-red/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gs-red">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-gs-red" aria-hidden />
                Running
              </span>
            )}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-gs-gray">{t.project.name}</td>
        <td className="whitespace-nowrap px-4 py-3 text-gs-gray">
          {formatDate(t.dueDate)}
          <OverdueBadge dueDate={t.dueDate} status={t.status} />
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          {t.assignedToId === meId ? (
            <span className="text-gs-gray">Me</span>
          ) : (
            <span className="font-medium" title="You created this task and handed it to someone else">
              {t.assignedTo?.name ?? "No one"}
            </span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-gs-gray">{t.createdById === meId ? "Me" : t.createdBy.name}</td>
        <td className="whitespace-nowrap px-4 py-3">
          <PriorityPill priority={t.priority} />
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          <TaskStatusChip status={t.status} label={statusLabel(t.status, t.taskType)} />
        </td>
      </TaskRow>
    );
  }

  const bucketedContent = (
    <div className="flex flex-col gap-6">
      {/* Count strip — the full bucket set at a glance (No Due Date shown only if any exist). */}
      <div className="flex flex-wrap gap-2">
        {BUCKETS.filter((b) => b.key !== "none" || bucketed.get("none")!.length > 0).map((b) => {
          const n = bucketed.get(b.key)!.length;
          return (
            <span
              key={b.key}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                b.key === "overdue" && n > 0 ? "bg-gs-red/10 text-gs-red" : "bg-gs-black/5 text-gs-gray"
              }`}
            >
              {b.label}: {n}
            </span>
          );
        })}
      </div>

      {openTasks.length === 0 ? (
        <p className="text-sm text-gs-gray">
          {anyFilter ? "No open tasks match these filters." : "Nothing open — you're all caught up."}
        </p>
      ) : (
        BUCKETS.map((b) => {
          const rows = bucketed.get(b.key)!;
          if (rows.length === 0) return null;
          return (
            <div key={b.key}>
              <h2 className={`text-sm font-semibold ${b.key === "overdue" ? "text-gs-red" : ""}`}>
                {b.label} <span className="font-normal text-gs-gray">· {rows.length}</span>
              </h2>
              <div className="mt-2 overflow-hidden rounded-lg border border-gs-gray/15 bg-white">
                <div className="table-scroll">
                  <table className="w-full min-w-[800px] text-sm">
                    <thead className="border-b border-gs-gray/10 bg-gs-light/40 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray/80">
                      <tr>
                        <th className="whitespace-nowrap px-4 py-2">Task</th>
                        <th className="whitespace-nowrap px-4 py-2">Project</th>
                        <th className="whitespace-nowrap px-4 py-2">Due Date</th>
                        <th className="whitespace-nowrap px-4 py-2">Assigned To</th>
                        <th className="whitespace-nowrap px-4 py-2">Created By</th>
                        <th className="whitespace-nowrap px-4 py-2">Priority</th>
                        <th className="whitespace-nowrap px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((t) => (
                        <BucketRow key={t.id} t={t} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  // Projects this person may create a task in — a "+ Add task" shows on those projects' headings only.
  const creatable = await getCreatableProjects();
  const creatableIds = new Set(isFailure(creatable) ? [] : creatable.map((p) => p.id));
  // Progress per project: the tasks the current filters leave for it, so the bar and its numbers move with
  // the filters. Every task listed (subtasks included), so the bar always adds up to the cards on the board.
  const progressFor = (projectId: string) => {
    const mine = tasks.filter((t) => t.projectId === projectId);
    if (mine.length === 0) return null;
    return <SprintProgress counts={bugCountsOf(mine)} size="sm" showLegend className="w-full" />;
  };
  const addTask = (projectId: string) =>
    creatableIds.has(projectId) ? (
      <NewTaskButton projectId={projectId} label="+ Add task" className="btn btn-secondary btn-sm shrink-0" />
    ) : null;

  // One header for a project on both the List and the Kanban: name (links to the project), client, task
  // count and "+ Add task" on top, the progress bar underneath — all inside the project's own card.
  const projectHeader = (project: Row["project"], count: number) => (
    <header className="grid items-center gap-x-6 gap-y-3 border-b border-gs-gray/10 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,32rem)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold leading-snug">
            <Link href={`/projects/${project.id}`} title="Open this project's tasks" className="hover:text-gs-red hover:underline">
              {project.name}
            </Link>
          </h2>
          <span className="rounded-full bg-gs-light px-2 py-0.5 text-xs font-semibold tabular-nums text-gs-gray">
            {count} {count === 1 ? "task" : "tasks"}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-gs-gray">{project.client.name}</p>
      </div>
      {/* Name on the left, a wide progress bar in the centre, "+ Add task" on the right; on a narrow screen they stack. */}
      <div className="w-full">{progressFor(project.id)}</div>
      <div className="sm:justify-self-end">{addTask(project.id)}</div>
    </header>
  );

  // Kanban: one board per project, each under the project's own heading (same grouping as the List).
  // The cards drop their project line because the heading above them already says it.
  const kanbanByProject = (
    <div className="flex flex-col gap-6">
      {byProject.size === 0 ? (
        <p className="text-sm text-gs-gray">
          {anyFilter ? "No tasks match these filters." : "Nothing assigned to you yet."}
        </p>
      ) : (
        Array.from(byProject.values()).map(({ project }) => {
          const projectTasks = viewTasks
            .filter((t) => t.projectId === project.id)
            .map((t) => ({ ...t, projectLabel: undefined, projectName: undefined }));
          return (
            <section key={project.id} className="overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm">
              {projectHeader(project, projectTasks.length)}
              <div className="bg-gs-light/40 p-3 md:p-4">
                <KanbanBoard tasks={projectTasks} surfacePath="/my-tasks" />
              </div>
            </section>
          );
        })
      )}
    </div>
  );

  return (
    <TaskDrawerProvider>
    <div>
      <PageHeader title="My Tasks" actions={<NewTaskButton />} />

      {/* The count cards describe all your open work (within the chosen sprint), so they stay put
          while the filters below narrow the lists. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Open tasks", value: scopeOpen.length, tone: "", href: "/my-tasks?status=open", on: fStatus === "open" && !fDue, accent: "bg-sky-500" },
          { label: "Overdue", value: scopeOverdue, tone: scopeOverdue > 0 ? "text-gs-red" : "", href: "/my-tasks?due=overdue", on: fDue === "overdue", accent: "bg-gs-red" },
          { label: "Due today", value: scopeToday, tone: scopeToday > 0 ? "text-amber-600" : "", href: "/my-tasks?due=today", on: fDue === "today", accent: "bg-amber-500" },
          { label: "In review", value: scopeOpen.filter((t) => t.status === "REVIEW").length, tone: "", href: "/my-tasks?status=REVIEW", on: fStatus === "REVIEW", accent: "bg-violet-500" },
        ].map((st) => (
          <Link
            key={st.label}
            href={st.href}
            aria-current={st.on ? "true" : undefined}
            className={`group relative overflow-hidden rounded-xl border bg-white px-4 py-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
              st.on ? "border-gs-black/30 ring-1 ring-gs-black/10" : "border-gs-gray/10"
            }`}
          >
            <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${st.accent}`} />
            <p className="text-xs font-medium text-gs-gray">{st.label}</p>
            <p className={`mt-1 font-heading text-2xl font-bold tabular-nums ${st.tone}`}>{st.value}</p>
          </Link>
        ))}
      </div>

      {/* Filter bar — applies as you change it; one filter drives List, Kanban, Calendar and By Due
          Date, so every view shows the same tasks. */}
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
              defaultValue={fQ}
              placeholder="Search tasks or projects…"
              autoComplete="off"
              className="field field-sm w-full pl-9"
            />
          </div>
        <div className="flex items-center gap-3 text-sm text-gs-gray">
          <span>
            {tasks.length} of {sprintScoped.length} {sprintScoped.length === 1 ? "task" : "tasks"}
          </span>
          {anyFilter && (
            <Link href="/my-tasks" className="font-medium text-gs-red hover:underline">
              Clear filters
            </Link>
          )}
        </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-gs-gray/10 bg-gs-light/40 px-4 py-3.5 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]">
        {projectOptions.length > 1 && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="project" className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Project</label>
            <Select id="project" name="project" defaultValue={fProject} className="field field-sm w-full">
              <option value="">All projects</option>
              {projectOptions.map(([id, p]) => (
                <option key={id} value={id} data-sub={p.client}>{p.name}</option>
              ))}
            </Select>
          </div>
        )}

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="status" className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Status</label>
          <Select id="status" name="status" defaultValue={fStatus} className="field field-sm w-full">
            <option value="">All statuses</option>
            <option value="open">Open (not completed)</option>
            <option value="completed">Completed</option>
            <option value="NEW">New</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="REVIEW">Review</option>
            <option value="ON_HOLD">On Hold</option>
            <option value="running">Timer running</option>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="due" className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Due</label>
          <Select id="due" name="due" defaultValue={fDue} className="field field-sm w-full">
            <option value="">Any time</option>
            <option value="overdue">Overdue</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="later">Later</option>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="priority" className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Priority</label>
          <Select id="priority" name="priority" defaultValue={fPriority} className="field field-sm w-full">
            <option value="">Any priority</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
        </div>

        {assigneeOptions.length > 0 && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="assignee" className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Assigned to</label>
            <Select id="assignee" name="assignee" defaultValue={fAssignee} className="field field-sm w-full">
              <option value="">Everyone</option>
              <option value="me">Me</option>
              {assigneeOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
          </div>
        )}

        {sprintWorkflowRelevant && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="sprint" className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Sprint</label>
            <Select id="sprint" name="sprint" defaultValue={validSprintFilter} className="field field-sm w-full">
              <option value="">All tasks</option>
              <option value="active">Active Sprint</option>
              <option value="backlog">Backlog</option>
              {pastSprints.length > 0 && (
                <optgroup label="Past Sprints">
                  {pastSprints.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
              )}
            </Select>
          </div>
        )}

        </div>
      </AutoFilterForm>

      <div className="mt-6">
        <TaskViews
          surfacePath="/my-tasks"
          tasks={viewTasks}
          todayKey={todayKey}
          showFilters={false}
          kanbanView={kanbanByProject}
          extraView={{ mode: "buckets", label: "By Due Date", content: bucketedContent }}
        >
          {byProject.size === 0 && (
            <p className="text-sm text-gs-gray">
              {anyFilter ? "No tasks match these filters." : "Nothing assigned to you yet."}
            </p>
          )}

          <div className="flex flex-col gap-6">
            {Array.from(byProject.values()).map(({ project, parents }) => (
          <section key={project.id} className="overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm">
            {projectHeader(project, parents.reduce((n, p) => n + (p.isOwn ? 1 : 0) + p.children.length, 0))}
            <div>
              <div className="table-scroll">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-gs-gray/10 bg-gs-light/40 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray/80">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-2">Task</th>
                      <th className="whitespace-nowrap px-4 py-2">Due Date</th>
                      <th className="whitespace-nowrap px-4 py-2">Assigned To</th>
                      <th className="whitespace-nowrap px-4 py-2">Created By</th>
                      <th className="whitespace-nowrap px-4 py-2">Priority</th>
                      <th className="whitespace-nowrap px-4 py-2">Status</th>
                      <th className="whitespace-nowrap px-4 py-2">Revisions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parents.map(({ parent, isOwn, children, contextNote }) => (
                      <Fragment key={isOwn ? parent.id : `ctx-${parent.parentTaskId}`}>
                        {isOwn ? (
                          <TaskRow taskId={parent.id} projectId={parent.projectId} className={`border-t border-gs-gray/10 ${parent.status === "COMPLETED" ? "bg-gs-light/50 opacity-75" : ""}`}>
                            <TaskCells t={parent} indent={false} />
                          </TaskRow>
                        ) : (
                          <tr className="border-t border-gs-gray/10">
                            <td className="px-4 py-2 text-gs-gray" colSpan={7}>
                              <Link
                                href={`/projects/${parent.projectId}/tasks/${parent.parentTaskId}`}
                                className="italic hover:underline"
                              >
                                {parent.parentTask?.name ?? "Parent task"}
                              </Link>
                              <span className="ml-1 text-xs">({contextNote})</span>
                            </td>
                          </tr>
                        )}
                        {children.map((c) => (
                          <TaskRow key={c.id} taskId={c.id} projectId={c.projectId} className={`border-t border-gs-gray/10 ${c.status === "COMPLETED" ? "bg-gs-light/50 opacity-75" : ""}`}>
                            <TaskCells t={c} indent />
                          </TaskRow>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ))}
          </div>
        </TaskViews>
      </div>
    </div>
    </TaskDrawerProvider>
  );
}
