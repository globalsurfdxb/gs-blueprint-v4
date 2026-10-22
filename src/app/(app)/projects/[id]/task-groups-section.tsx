"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { statusLabel } from "@/lib/bug";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TaskOpener, useTaskDrawer } from "@/components/task-drawer";
import { TaskRow as ClickableRow } from "@/components/task-row";
import { useToast } from "@/components/toast";
import { reassignTask } from "@/lib/actions/tasks";
import { isFailure } from "@/lib/action-result";
import { Select } from "@/components/select";
import { SprintProgress } from "@/components/sprint-progress";
import { bugCountsOf } from "@/lib/bug-sprints";

type GroupTask = {
  id: string;
  name: string;
  status: string;
  priority: string;
  dueDate: string;
  revisionCount: number;
  assigneeId: string | null;
  assigneeName: string | null;
  createdByName: string | null;
  daysOverdue: number | null;
  isTimerRunning: boolean;
  taskType: string;
  subtasks: GroupTask[];
};
type GroupCard = {
  id: string;
  name: string;
  leadName: string;
  tasks: GroupTask[];
  /** People the viewer can hand this group's tasks to — empty unless they lead the group (or are Admin). */
  assignees: { id: string; name: string }[];
  hasHiddenTasks: boolean;
  canCreateTask: boolean;
  canRemove: boolean;
  totalSeconds: number | null;
  // Team Capacity (hrs/wk) — only shown on Development/QA teams (isDevQa).
  isDevQa: boolean;
  capacity: string | null;
  canEditCapacity: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  IN_PROGRESS: "In Progress",
  REVIEW: "Review",
  REVISION: "Revision",
  COMPLETED: "Completed",
  ON_HOLD: "On Hold",
};

function formatSeconds(seconds: number) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs === 0 && mins === 0) return "0m";
  return [hrs > 0 ? `${hrs}h` : null, mins > 0 ? `${mins}m` : null].filter(Boolean).join(" ");
}

function matchesFilter(t: GroupTask, owner: string, status: string) {
  return (owner === "all" || t.assigneeId === owner) && (status === "all" || t.status === status);
}

/** Team Capacity (hrs/wk) — a static planned-capacity figure shown on Development/QA teams
 * only. Admin/Cluster Head edits inline; everyone else sees it read-only. Blank by default. */
function TeamCapacity({
  groupId,
  capacity,
  canEdit,
  action,
}: {
  groupId: string;
  capacity: string | null;
  canEdit: boolean;
  action: (groupId: string, formData: FormData) => void;
}) {
  const [editing, setEditing] = useState(false);
  const withId = action.bind(null, groupId);
  const shown = capacity ? `${Number(capacity)} hrs/wk` : "—";

  if (!canEdit) {
    return <p className="mt-1 text-xs text-gs-gray">Capacity: {shown}</p>;
  }
  if (!editing) {
    return (
      <p className="mt-1 text-xs text-gs-gray">
        Capacity: {shown}{" "}
        <button type="button" onClick={() => setEditing(true)} className="ml-1 text-gs-red hover:underline">
          {capacity ? "Edit" : "Set"}
        </button>
      </p>
    );
  }
  return (
    <ActionForm
      action={withId}
      successMessage="Team capacity updated."
      onSuccess={() => setEditing(false)}
      className="mt-1 flex items-center gap-2"
    >
      <label className="text-xs text-gs-gray">Capacity (hrs/wk)</label>
      <input
        name="capacity"
        type="number"
        min="0"
        step="0.5"
        defaultValue={capacity ? String(Number(capacity)) : ""}
        placeholder="blank = none"
        className="field field-sm min-h-8 w-28 text-xs"
      />
      <SubmitButton
        pendingLabel="Saving…"
        className="btn btn-secondary btn-sm min-h-8 px-2.5"
      >
        Save
      </SubmitButton>
      <button type="button" onClick={() => setEditing(false)} className="text-xs text-gs-gray hover:underline">
        Cancel
      </button>
    </ActionForm>
  );
}

function RunningBadge() {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gs-red/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gs-red align-middle">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-gs-red" aria-hidden />
      Running
    </span>
  );
}

/** The Assignee cell. A group Lead (or Admin) gets a picker to hand the task to someone on the team right
 * here; everyone else just sees the name. Clicks in this cell never open the task. */
function AssigneeCell({ task, assignees }: { task: GroupTask; assignees: { id: string; name: string }[] }) {
  const router = useRouter();
  const { addToast } = useToast();
  const [pending, startTransition] = useTransition();
  const canReassign = assignees.length > 0 && task.status !== "COMPLETED";
  if (!canReassign) {
    return <td className="px-3 py-1.5 text-gs-gray">{task.assigneeName ?? "Unassigned"}</td>;
  }
  // The current assignee always appears in the list, even if they're no longer on the team pool.
  const options =
    !task.assigneeId || assignees.some((a) => a.id === task.assigneeId)
      ? assignees
      : [...assignees, { id: task.assigneeId, name: task.assigneeName ?? "Current assignee" }];

  function change(toId: string) {
    if (!toId || toId === task.assigneeId) return;
    const fd = new FormData();
    fd.set("assignedToId", toId);
    startTransition(async () => {
      try {
        const result = await reassignTask(task.id, fd);
        if (isFailure(result)) {
          addToast(result.error, "error");
        } else {
          addToast(`Assigned to ${options.find((o) => o.id === toId)?.name ?? "them"}.`, "success");
        }
      } catch {
        addToast("Couldn't change the assignee. Please try again.", "error");
      }
      router.refresh();
    });
  }

  return (
    <td className="px-3 py-1" onClick={(e) => e.stopPropagation()}>
      <Select
        aria-label={`Assignee for ${task.name}`}
        value={task.assigneeId ?? ""}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="field field-sm min-w-36 text-xs"
      >
        {!task.assigneeId && <option value="" disabled>Unassigned</option>}
        {options.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </Select>
    </td>
  );
}

function TaskRow({
  projectId,
  task,
  depth,
  assignees,
}: {
  projectId: string;
  task: GroupTask;
  depth: number;
  assignees: { id: string; name: string }[];
}) {
  const hasSubs = task.subtasks.length > 0;
  const [open, setOpen] = useState(true);
  return (
    <>
      <ClickableRow taskId={task.id} projectId={projectId} className="border-t border-gs-gray/10">
        <td className="px-3 py-1.5" style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}>
          <span className="inline-flex items-center">
            {hasSubs ? (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-label={open ? "Collapse subtasks" : "Expand subtasks"}
                className="mr-1 w-4 shrink-0 text-gs-gray hover:text-gs-black"
              >
                {open ? "▾" : "▸"}
              </button>
            ) : (
              depth > 0 && <span className="mr-1 w-4 shrink-0 text-gs-gray/50">└</span>
            )}
            {task.taskType === "BUG" && (
              <span className="mr-1.5 rounded-full bg-gs-red/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gs-red align-middle">
                Bug
              </span>
            )}
            <TaskOpener taskId={task.id} projectId={projectId} className="text-left font-medium hover:underline">
              {task.name}
            </TaskOpener>
            {task.isTimerRunning && <RunningBadge />}
          </span>
        </td>
        <AssigneeCell task={task} assignees={assignees} />
        <td className="px-3 py-1.5 text-gs-gray">{task.createdByName ?? "—"}</td>
        <td className="px-3 py-1.5 text-gs-gray">
          {task.dueDate}
          {task.daysOverdue !== null && (
            <span className={task.daysOverdue > 0 ? "ml-1 text-gs-red" : "ml-1 text-gs-gray"}>
              ({task.daysOverdue} day{task.daysOverdue === 1 ? "" : "s"})
            </span>
          )}
        </td>
        <td className="px-3 py-1.5 text-gs-gray">{task.priority}</td>
        <td className="px-3 py-1.5 text-gs-gray">{statusLabel(task.status, task.taskType)}</td>
        <td className="px-3 py-1.5">
          <span
            className={
              task.revisionCount >= 2 ? "text-gs-red" : task.revisionCount === 1 ? "text-amber-600" : "text-gs-gray"
            }
          >
            {task.revisionCount}
          </span>
        </td>
      </ClickableRow>
      {hasSubs &&
        open &&
        task.subtasks.map((s) => (
          <TaskRow key={s.id} projectId={projectId} task={s} depth={depth + 1} assignees={assignees} />
        ))}
    </>
  );
}

function TaskTable({
  projectId,
  tasks,
  assignees = [],
}: {
  projectId: string;
  tasks: GroupTask[];
  assignees?: { id: string; name: string }[];
}) {
  return (
    <table className="w-full min-w-[760px] text-sm">
      <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
        <tr>
          <th className="whitespace-nowrap px-3 py-2">Task</th>
          <th className="whitespace-nowrap px-3 py-2">Assignee</th>
          <th className="whitespace-nowrap px-3 py-2">Created By</th>
          <th className="whitespace-nowrap px-3 py-2">Due Date</th>
          <th className="whitespace-nowrap px-3 py-2">Priority</th>
          <th className="whitespace-nowrap px-3 py-2">Status</th>
          <th className="whitespace-nowrap px-3 py-2">Revisions</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((t) => (
          <TaskRow key={t.id} projectId={projectId} task={t} depth={0} assignees={assignees} />
        ))}
      </tbody>
    </table>
  );
}

export function TaskGroupsSection({
  projectId,
  groupCards,
  ungroupedTasks,
  canAttachGroups,
  availableLeadRoles,
  attachAction,
  removeAction,
  setCapacityAction,
}: {
  projectId: string;
  groupCards: GroupCard[];
  ungroupedTasks: GroupTask[];
  canAttachGroups: boolean;
  availableLeadRoles: { id: string; label: string }[];
  attachAction: (formData: FormData) => void;
  removeAction: (groupId: string, formData: FormData) => void;
  setCapacityAction: (groupId: string, formData: FormData) => void;
}) {
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const drawer = useTaskDrawer();
  const canCreateAny = groupCards.some((g) => g.canCreateTask);

  const owners = useMemo(() => {
    const byId = new Map<string, string>();
    for (const t of [...groupCards.flatMap((g) => g.tasks), ...ungroupedTasks]) {
      if (t.assigneeId) byId.set(t.assigneeId, t.assigneeName ?? t.assigneeId);
    }
    return Array.from(byId.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [groupCards, ungroupedTasks]);

  const hasAnyTasks = groupCards.some((g) => g.tasks.length > 0) || ungroupedTasks.length > 0;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold uppercase text-gs-gray">Task Groups</h2>
          {canCreateAny && drawer && (
            <button
              type="button"
              onClick={() => drawer.openCreate(projectId)}
              className="btn btn-primary btn-sm"
            >
              + Add Task
            </button>
          )}
        </div>
        {hasAnyTasks && (
          <div className="flex items-center gap-2">
            <Select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="field field-sm text-xs"
            >
              <option value="all">All Owners</option>
              {owners.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="field field-sm text-xs"
            >
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-4">
        {groupCards.length === 0 && (
          <p className="text-sm text-gs-gray">No discipline Leads attached yet.</p>
        )}
        {groupCards.map((g) => {
          const removeWithId = removeAction.bind(null, g.id);
          const shown = g.tasks.filter((t) => matchesFilter(t, ownerFilter, statusFilter));
          return (
            <section key={g.id} className="overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm">
              {/* Name and lead on the left, the group's progress in the centre, remove on the right. */}
              <header className="grid items-center gap-x-6 gap-y-3 border-b border-gs-gray/10 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,32rem)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold leading-snug">{g.name}</h3>
                  <p className="mt-0.5 text-sm text-gs-gray">
                    Lead: {g.leadName}
                    {g.totalSeconds !== null && ` · ${formatSeconds(g.totalSeconds)} logged`}
                  </p>
                </div>
                <div className="w-full">
                  {g.tasks.length > 0 && <SprintProgress counts={bugCountsOf(g.tasks)} size="sm" showLegend />}
                </div>
                <div className="sm:justify-self-end">
                  {g.canRemove && (
                    <ActionForm action={removeWithId}>
                      <button type="submit" className="text-xs text-gs-gray hover:underline">
                        Remove Group
                      </button>
                    </ActionForm>
                  )}
                </div>
              </header>
              {g.isDevQa && (
                <div className="border-b border-gs-gray/10 px-4 py-2.5">
                  <TeamCapacity groupId={g.id} capacity={g.capacity} canEdit={g.canEditCapacity} action={setCapacityAction} />
                </div>
              )}
              <div>
                {g.tasks.length === 0 && (
                  <p className="px-4 py-4 text-sm text-gs-gray">
                    {g.hasHiddenTasks ? "This group has tasks, but only your own show here." : "No tasks yet."}
                  </p>
                )}
                {g.tasks.length > 0 && shown.length === 0 && (
                  <p className="px-4 py-4 text-sm text-gs-gray">No tasks match the current filter.</p>
                )}
                {shown.length > 0 && (
                  <div className="table-scroll">
                    <TaskTable projectId={projectId} tasks={shown} assignees={g.assignees} />
                  </div>
                )}
              </div>
            </section>
          );
        })}

        {ungroupedTasks.length > 0 && (() => {
          const shown = ungroupedTasks.filter((t) => matchesFilter(t, ownerFilter, statusFilter));
          return (
            <div className="rounded-lg border border-gs-gray/15 bg-white p-4">
              <span className="text-sm font-semibold">Ungrouped Tasks</span>
              <p className="text-xs text-gs-gray">Created before Task Groups existed on this project.</p>
              <div className="mt-2">
                {shown.length === 0 ? (
                  <p className="text-xs text-gs-gray">No tasks match the current filter.</p>
                ) : (
                  <div className="table-scroll">
                    <TaskTable projectId={projectId} tasks={shown} />
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {canAttachGroups && (
        <ActionForm action={attachAction} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex w-full flex-col gap-1.5 sm:w-auto">
            <label className="text-xs font-medium text-gs-gray">Attach Discipline Lead</label>
            <Select name="leadRoleId" required className="field w-full min-w-0 sm:w-72">
              <option value="" disabled>
                {availableLeadRoles.length === 0 ? "No more Leads available" : "Select a Lead"}
              </option>
              {availableLeadRoles.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </Select>
          </div>
          <button
            type="submit"
            disabled={availableLeadRoles.length === 0}
            className="btn btn-secondary"
          >
            Attach
          </button>
        </ActionForm>
      )}
      {groupCards.some((g) => g.canCreateTask) && (
        <p className="mt-2 text-xs text-gs-gray">
          Any Lead attached to this project can create a task in any group here and hand it directly to a
          different team&apos;s Lead. Reviewing, holding, and viewing the full task list stays with that
          group&apos;s own Lead once the task exists.
        </p>
      )}
    </div>
  );
}
