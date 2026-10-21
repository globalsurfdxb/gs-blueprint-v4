import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isLead, SOCIAL_MEDIA_POD_NAME, CONTENT_POD_NAME, DESIGN_POD_NAME } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { addDays, daysOverdue, getLocalDateString } from "@/lib/timezone";
import { PageHeader } from "@/components/page-header";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { TaskStatusChip } from "@/components/task-chips";
import { statusLabel } from "@/lib/bug";
import { Select } from "@/components/select";

// The lens the page is shown through. "action" is the original queue (submitted for review, or
// unassigned); the rest are the filtered lists the Lead dashboard's cards open (QA F-02), plus a
// Completed list so finished work doesn't vanish from a Lead's views (QA F-04).
const VIEWS = {
  action: "Needs my action",
  unassigned: "Unassigned",
  overdue: "Overdue",
  flagged: "Revision-flagged (2+ revisions)",
  completed: "Completed (last 30 days)",
} as const;
type ViewKey = keyof typeof VIEWS;

const COMPLETED_WINDOW_DAYS = 30;
const FALLBACK_LOCATION = "DUBAI";

const taskInclude = { project: { include: { client: true } }, assignedTo: true, parentTask: true } as const;

export default async function MyReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    q?: string;
    project?: string;
    assignee?: string;
    status?: string;
    priority?: string;
    type?: string;
    due?: string;
    revisions?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isLead(user)) redirect("/");

  const sp = await searchParams;
  const viewParam = sp.view ?? "";
  const view: ViewKey = viewParam in VIEWS ? (viewParam as ViewKey) : "action";

  const now = new Date();

  // Cross-project queue for a Lead's own groups — the "beside My Tasks" counterpart to
  // their personal backlog, not scoped to one project the way the project detail page's
  // group card is. Two things land here: work submitted for review, and a cross-group
  // handoff that arrived unassigned — the receiving Lead has to route it (to themselves or
  // a Contributor) before anyone can act on it, and today that's only ever surfaced by a
  // one-time notification. A missed notification left it invisible until someone happened
  // to open the project's Task Groups view, so it belongs in this queue too.
  const baseWhere = {
    group: { leadUserId: user.id },
    project: { status: { not: "COMPLETED" as const }, archivedAt: null },
  };
  const loadTasks = (where: object, orderBy: object) =>
    prisma.task.findMany({ where: { ...baseWhere, ...where }, include: taskInclude, orderBy });

  let tasks: Awaited<ReturnType<typeof loadTasks>>;
  if (view === "action") {
    tasks = await loadTasks(
      { OR: [{ status: "REVIEW" }, { assignedToId: null, status: { not: "COMPLETED" } }] },
      { dueDate: "asc" },
    );
  } else if (view === "completed") {
    const since = new Date(now.getTime() - COMPLETED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    tasks = await loadTasks(
      { parentTaskId: null, status: "COMPLETED", completedAt: { gte: since } },
      { completedAt: "desc" },
    );
  } else {
    // Same population and the same tests as the dashboard cards (top-level, still-open tasks),
    // so the number on a card always equals the rows it opens.
    const open = await loadTasks({ parentTaskId: null, status: { not: "COMPLETED" } }, { dueDate: "asc" });
    tasks = open.filter((t) => {
      if (view === "unassigned") return t.assignedToId === null;
      if (view === "flagged") return t.revisionCount >= 2;
      const late = daysOverdue(t.dueDate, t.assignedTo?.location ?? FALLBACK_LOCATION, now);
      return t.status !== "ON_HOLD" && late !== null && late > 0;
    });
  }

  // A Lead an Admin has restricted to their own tasks never sees teammates' work here either.
  if (user.restrictToOwnTasks) {
    tasks = tasks.filter((t) => t.assignedToId === user.id || t.createdById === user.id);
  }

  // ---- Filter bar: search, project, assignee, status, priority, type, due, revisions. Layered on
  // top of the "Show" view above; options come from what the view returned, so every choice has
  // at least one row behind it. ----
  const viewTasks = tasks;
  const projectOptions = Array.from(new Map(viewTasks.map((t) => [t.projectId, t.project.name])).entries()).sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const assigneeOptions = Array.from(
    new Map(viewTasks.filter((t) => t.assignedTo).map((t) => [t.assignedToId as string, t.assignedTo!.name])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));
  const hasUnassigned = viewTasks.some((t) => t.assignedToId === null);
  const hasBugs = viewTasks.some((t) => t.taskType === "BUG");
  const STATUS_FILTERS = ["NEW", "IN_PROGRESS", "REVIEW", "ON_HOLD", "COMPLETED"] as const;
  const PRIORITY_FILTERS = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;

  const fQ = (sp.q ?? "").trim();
  const fProject = projectOptions.some(([id]) => id === sp.project) ? (sp.project as string) : "";
  const fAssignee =
    sp.assignee === "none" && hasUnassigned
      ? "none"
      : assigneeOptions.some(([id]) => id === sp.assignee)
        ? (sp.assignee as string)
        : "";
  const fStatus = (STATUS_FILTERS as readonly string[]).includes(sp.status ?? "") ? (sp.status as string) : "";
  const fPriority = (PRIORITY_FILTERS as readonly string[]).includes(sp.priority ?? "") ? (sp.priority as string) : "";
  const fType = hasBugs && (sp.type === "BUG" || sp.type === "STANDARD") ? sp.type : "";
  const fDue = ["overdue", "today", "week"].includes(sp.due ?? "") ? (sp.due as string) : "";
  const fRevisions = ["1", "2"].includes(sp.revisions ?? "") ? Number(sp.revisions) : 0;
  const anyFilter = !!(fQ || fProject || fAssignee || fStatus || fPriority || fType || fDue || fRevisions || view !== "action");
  const needle = fQ.toLowerCase();

  const todayStr = getLocalDateString(user.location, now);
  const weekEndStr = addDays(todayStr, 6);

  tasks = viewTasks.filter((t) => {
    if (fProject && t.projectId !== fProject) return false;
    if (fAssignee === "none" ? t.assignedToId !== null : fAssignee && t.assignedToId !== fAssignee) return false;
    if (fStatus && t.status !== fStatus) return false;
    if (fPriority && t.priority !== fPriority) return false;
    if (fType && t.taskType !== fType) return false;
    if (fRevisions && t.revisionCount < fRevisions) return false;
    if (fDue) {
      if (t.status === "COMPLETED") return false;
      const d = t.dueDate.toISOString().slice(0, 10);
      if (fDue === "overdue") {
        const late = daysOverdue(t.dueDate, t.assignedTo?.location ?? FALLBACK_LOCATION, now);
        if (t.status === "ON_HOLD" || late === null || late <= 0) return false;
      } else if (fDue === "today") {
        if (d !== todayStr) return false;
      } else if (d < todayStr || d > weekEndStr) {
        return false;
      }
    }
    if (
      needle &&
      !t.name.toLowerCase().includes(needle) &&
      !t.project.name.toLowerCase().includes(needle) &&
      !(t.assignedTo?.name ?? "").toLowerCase().includes(needle)
    ) {
      return false;
    }
    return true;
  });

  const groups = new Map<string, { project: (typeof tasks)[number]["project"]; tasks: typeof tasks }>();
  for (const t of tasks) {
    const existing = groups.get(t.projectId);
    if (existing) {
      existing.tasks.push(t);
    } else {
      groups.set(t.projectId, { project: t.project, tasks: [t] });
    }
  }

  // Content Calendar approval checkpoints (see approveCalendarHandoffToDesign /
  // approveCalendarFinalDelivery): these sit in Completed, not Review, and in a group this
  // user doesn't lead (Content or Design), so the query above never surfaces them — but
  // they're still an action waiting on this project's own Social Media Lead, so they
  // belong in the same "waiting on you" queue.
  const socialMediaGroups = await prisma.taskGroup.findMany({
    where: {
      leadUserId: user.id,
      pod: { name: SOCIAL_MEDIA_POD_NAME },
      project: { status: { not: "COMPLETED" }, archivedAt: null },
    },
    select: { projectId: true },
  });
  const calendarProjectIds = socialMediaGroups.map((g) => g.projectId);

  let calendarPending: ((typeof tasks)[number] & { calendarStage: "content" | "design" })[] = [];
  // Approval checkpoints belong to the action queue only, not the filtered lists.
  if (view === "action" && !user.restrictToOwnTasks && calendarProjectIds.length > 0) {
    const contentCandidates = await prisma.task.findMany({
      where: {
        projectId: { in: calendarProjectIds },
        status: "COMPLETED",
        publishDate: { not: null },
        contentTypeId: { not: null },
        group: { pod: { name: CONTENT_POD_NAME } },
      },
      include: { project: { include: { client: true } }, assignedTo: true, parentTask: true },
      orderBy: { dueDate: "asc" },
    });
    const contentIds = contentCandidates.map((t) => t.id);
    const successors =
      contentIds.length > 0
        ? await prisma.task.findMany({ where: { predecessorTaskId: { in: contentIds } }, select: { predecessorTaskId: true } })
        : [];
    const hasSuccessor = new Set(successors.map((s) => s.predecessorTaskId));
    const contentPending = contentCandidates
      .filter((t) => !hasSuccessor.has(t.id))
      .map((t) => ({ ...t, calendarStage: "content" as const }));

    const designPending = (
      await prisma.task.findMany({
        where: {
          projectId: { in: calendarProjectIds },
          status: "COMPLETED",
          publishDate: { not: null },
          contentTypeId: { not: null },
          calendarApprovedAt: null,
          group: { pod: { name: DESIGN_POD_NAME } },
        },
        include: { project: { include: { client: true } }, assignedTo: true, parentTask: true },
        orderBy: { dueDate: "asc" },
      })
    ).map((t) => ({ ...t, calendarStage: "design" as const }));

    calendarPending = [...contentPending, ...designPending];
  }

  calendarPending = calendarPending.filter(
    (t) =>
      (!fProject || t.projectId === fProject) &&
      (!fAssignee || (fAssignee === "none" ? t.assignedToId === null : t.assignedToId === fAssignee)) &&
      (!needle ||
        t.name.toLowerCase().includes(needle) ||
        t.project.name.toLowerCase().includes(needle) ||
        (t.assignedTo?.name ?? "").toLowerCase().includes(needle)),
  );

  const calendarGroups = new Map<string, { project: (typeof tasks)[number]["project"]; tasks: typeof calendarPending }>();
  for (const t of calendarPending) {
    const existing = calendarGroups.get(t.projectId);
    if (existing) {
      existing.tasks.push(t);
    } else {
      calendarGroups.set(t.projectId, { project: t.project, tasks: [t] });
    }
  }

  return (
    <div>
      <PageHeader
        title="My Reviews"
        description={<>
Work submitted for your review, or still unassigned, across every project you lead a Task Group on.
</>}
      />

      {/* Filter bar — applies as you change it (search waits for a short pause). */}
      <AutoFilterForm className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-gs-gray/10 bg-white p-3 shadow-sm">
        <div className="flex w-full flex-col gap-1 sm:w-64">
          <label htmlFor="q" className="text-xs font-medium text-gs-gray">Search</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={fQ}
            placeholder="Task, project or person…"
            autoComplete="off"
            className="field field-sm w-full"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="view" className="text-xs font-medium text-gs-gray">Show</label>
          <Select id="view" name="view" defaultValue={view} className="field field-sm min-w-44">
            {Object.entries(VIEWS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
        </div>

        {projectOptions.length > 1 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="project" className="text-xs font-medium text-gs-gray">Project</label>
            <Select id="project" name="project" defaultValue={fProject} className="field field-sm min-w-44">
              <option value="">All projects</option>
              {projectOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
          </div>
        )}

        {(assigneeOptions.length > 0 || hasUnassigned) && (
          <div className="flex flex-col gap-1">
            <label htmlFor="assignee" className="text-xs font-medium text-gs-gray">Assignee</label>
            <Select id="assignee" name="assignee" defaultValue={fAssignee} className="field field-sm min-w-40">
              <option value="">Everyone</option>
              {hasUnassigned && <option value="none">Unassigned</option>}
              {assigneeOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs font-medium text-gs-gray">Status</label>
          <Select id="status" name="status" defaultValue={fStatus} className="field field-sm min-w-36">
            <option value="">All statuses</option>
            <option value="NEW">New</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="REVIEW">Review</option>
            <option value="ON_HOLD">On Hold</option>
            <option value="COMPLETED">Completed</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="due" className="text-xs font-medium text-gs-gray">Due</label>
          <Select id="due" name="due" defaultValue={fDue} className="field field-sm min-w-36">
            <option value="">Any time</option>
            <option value="overdue">Overdue</option>
            <option value="today">Today</option>
            <option value="week">Next 7 days</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="priority" className="text-xs font-medium text-gs-gray">Priority</label>
          <Select id="priority" name="priority" defaultValue={fPriority} className="field field-sm min-w-36">
            <option value="">Any priority</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="revisions" className="text-xs font-medium text-gs-gray">Revisions</label>
          <Select id="revisions" name="revisions" defaultValue={fRevisions ? String(fRevisions) : ""} className="field field-sm min-w-36">
            <option value="">Any</option>
            <option value="1">1 or more</option>
            <option value="2">2 or more (flagged)</option>
          </Select>
        </div>

        {hasBugs && (
          <div className="flex flex-col gap-1">
            <label htmlFor="type" className="text-xs font-medium text-gs-gray">Type</label>
            <Select id="type" name="type" defaultValue={fType} className="field field-sm min-w-32">
              <option value="">Tasks &amp; bugs</option>
              <option value="STANDARD">Tasks</option>
              <option value="BUG">Bugs</option>
            </Select>
          </div>
        )}

        <div className="flex min-h-9 items-center gap-3 pb-0.5 text-sm text-gs-gray sm:ml-auto">
          <span>
            {tasks.length} of {viewTasks.length} {viewTasks.length === 1 ? "task" : "tasks"}
          </span>
          {anyFilter && (
            <Link href="/my-reviews" className="font-medium text-gs-red hover:underline">
              Clear filters
            </Link>
          )}
        </div>
      </AutoFilterForm>

      {groups.size === 0 && calendarGroups.size === 0 && (
        <p className="mt-6 text-sm text-gs-gray">
          {anyFilter && view === "action" && viewTasks.length > 0
            ? "No tasks match these filters."
            : view === "action"
              ? "Nothing waiting on your review."
              : viewTasks.length > 0
                ? "No tasks match these filters."
                : `No tasks to show for “${VIEWS[view]}”.`}
        </p>
      )}

      {calendarGroups.size > 0 && (
        <div className="mt-6 flex flex-col gap-6">
          <h2 className="text-sm font-semibold uppercase text-gs-gray">Content Calendar Approvals</h2>
          {Array.from(calendarGroups.values()).map(({ project, tasks: projectTasks }) => (
            <div key={project.id}>
              <h3 className="text-sm font-semibold">
                {project.name} <span className="text-gs-gray">· {project.client.name}</span>
              </h3>
              <div className="mt-2 overflow-hidden rounded-lg border border-gs-gray/15 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                      <tr>
                        <th className="whitespace-nowrap px-4 py-3">Task</th>
                        <th className="whitespace-nowrap px-4 py-3">Assignee</th>
                        <th className="whitespace-nowrap px-4 py-3">Due Date</th>
                        <th className="whitespace-nowrap px-4 py-3">Needs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectTasks.map((t) => (
                        <tr key={t.id} className="border-t border-gs-gray/10">
                          <td className="px-4 py-3">
                            <Link href={`/projects/${t.projectId}/tasks/${t.id}`} className="font-medium hover:underline">
                              {t.name}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gs-gray">{t.assignedTo?.name ?? "Unassigned"}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-gs-gray">{formatDate(t.dueDate)}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="font-medium text-gs-red">
                              {t.calendarStage === "content" ? "Approve → Design" : "Approve Final Delivery"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {Array.from(groups.values()).map(({ project, tasks: projectTasks }) => (
          <div key={project.id}>
            <h2 className="text-sm font-semibold">
              {project.name} <span className="text-gs-gray">· {project.client.name}</span>
            </h2>
            <div className="mt-2 overflow-hidden rounded-lg border border-gs-gray/15 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3">Task</th>
                      <th className="whitespace-nowrap px-4 py-3">Assignee</th>
                      <th className="whitespace-nowrap px-4 py-3">Due Date</th>
                      <th className="whitespace-nowrap px-4 py-3">Status</th>
                      <th className="whitespace-nowrap px-4 py-3">Priority</th>
                      <th className="whitespace-nowrap px-4 py-3">Revisions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectTasks.map((t) => {
                      const late = daysOverdue(t.dueDate, t.assignedTo?.location, now);
                      return (
                        <tr key={t.id} className="border-t border-gs-gray/10">
                          <td className="px-4 py-3">
                            <Link href={`/projects/${t.projectId}/tasks/${t.id}`} className="font-medium hover:underline">
                              {t.parentTask ? `${t.parentTask.name} › ${t.name}` : t.name}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {t.assignedTo ? (
                              <span className="text-gs-gray">{t.assignedTo.name}</span>
                            ) : (
                              <span className="font-medium text-gs-red">Not Assigned</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gs-gray">
                            {formatDate(t.dueDate)}
                            {late !== null && (
                              <span className={late > 0 ? "ml-1 text-gs-red" : "ml-1 text-gs-gray"}>
                                ({late} day{late === 1 ? "" : "s"})
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <TaskStatusChip status={t.status} label={statusLabel(t.status, t.taskType)} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gs-gray">{t.priority}</td>
                          <td className="px-4 py-3">
                            <span
                              className={
                                t.revisionCount >= 2
                                  ? "text-gs-red"
                                  : t.revisionCount === 1
                                    ? "text-amber-600"
                                    : "text-gs-gray"
                              }
                            >
                              {t.revisionCount}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
