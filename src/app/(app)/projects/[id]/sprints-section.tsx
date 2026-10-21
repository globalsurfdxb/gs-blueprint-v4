"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SprintProgress } from "@/components/sprint-progress";
import { KanbanBoard, type ViewTask } from "@/components/task-views";
import { TaskDrawerProvider } from "@/components/task-drawer";
import type { SprintCounts } from "@/lib/sprint-dashboard";

/** An existing task that could be put into a sprint (backlog, or sitting in another open sprint). */
export type SprintCandidate = {
  id: string;
  name: string;
  groupName: string;
  assigneeName: string | null;
  sprintId: string | null;
  sprintName: string | null;
  /** Overrides the sprint badge on the row (e.g. a bug's status when picking bugs to assign). */
  badge?: string;
};

export type SprintRow = {
  id: string;
  name: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED";
  startLabel: string;
  endLabel: string;
  startInput: string;
  endInput: string;
  taskCount: number;
  datesLocked: boolean; // dates locked once Active (PRD 8.14)
  counts: SprintCounts;
  /** "5 days left", "Starts in 3 days", "Ended 2 days ago" — computed on the server. */
  timingLabel: string;
  timingTone: "ok" | "warn" | "late" | "muted";
};

const STATUS_STYLE: Record<SprintRow["status"], string> = {
  PLANNED: "bg-gs-black/5 text-gs-black",
  ACTIVE: "bg-green-100 text-green-700",
  COMPLETED: "bg-gs-gray/15 text-gs-gray",
};
const STATUS_LABEL: Record<SprintRow["status"], string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  COMPLETED: "Completed",
};
/** What a manager does next with a sprint in each state. Planned → start it (dates lock, it shows as
 * the running sprint); Active → complete it (it becomes history); Completed → reopen it. */
const NEXT_STEP: Record<
  SprintRow["status"],
  { to: SprintRow["status"]; label: string; done: string; style: string }
> = {
  PLANNED: { to: "ACTIVE", label: "Start sprint", done: "Sprint started.", style: "btn-primary" },
  ACTIVE: { to: "COMPLETED", label: "Complete sprint", done: "Sprint completed.", style: "btn-dark" },
  COMPLETED: { to: "ACTIVE", label: "Reopen sprint", done: "Sprint reopened.", style: "btn-secondary" },
};
const TIMING_STYLE: Record<SprintRow["timingTone"], string> = {
  ok: "text-green-700",
  warn: "text-amber-600",
  late: "text-gs-red",
  muted: "text-gs-gray",
};

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`h-5 w-5 shrink-0 text-gs-gray transition-transform duration-200 ${open ? "rotate-90" : ""}`}
    >
      <path d="M8 5l5 5-5 5" />
    </svg>
  );
}

/** A searchable tick-list of existing tasks (inputs are named "taskId"). The footer is supplied by the
 * caller as a function of the current selection count, so the same list serves "add to this sprint"
 * and "create a new sprint with these tasks". Tasks already in another open sprint show that
 * sprint's name — adding them moves them. */
export function TaskChecklist({
  candidates,
  footer,
  noun = "tasks",
  unsetLabel = "Backlog",
}: {
  candidates: SprintCandidate[];
  footer: (selectedCount: number) => React.ReactNode;
  /** What the rows are called in the search box and empty state ("tasks", "bugs"). */
  noun?: string;
  /** Badge for a row that isn't in any sprint yet. */
  unsetLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();
  const shown = (c: SprintCandidate) =>
    !q ||
    c.name.toLowerCase().includes(q) ||
    c.groupName.toLowerCase().includes(q) ||
    (c.assigneeName ?? "").toLowerCase().includes(q);
  const visible = candidates.filter(shown);
  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of visible) {
        if (allVisibleSelected) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });

  return (
    <div className="overflow-hidden rounded-xl border border-gs-gray/15 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gs-gray/10 px-3 py-2.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${noun}, groups or people…`}
          autoComplete="off"
          aria-label={`Search ${noun}`}
          className="field field-sm w-full sm:w-72"
        />
        <label className="inline-flex items-center gap-2 text-xs text-gs-gray">
          <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} className="h-4 w-4" />
          Select all {q ? "shown" : ""} ({visible.length})
        </label>
      </div>

      <ul className="max-h-64 overflow-y-auto">
        {candidates.map((c) => (
          <li key={c.id} className={shown(c) ? "" : "hidden"}>
            <label className="flex cursor-pointer items-start gap-3 border-b border-gs-gray/10 px-3 py-2.5 last:border-b-0 hover:bg-gs-light/60">
              <input
                type="checkbox"
                name="taskId"
                value={c.id}
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-snug">{c.name}</span>
                <span className="block text-xs text-gs-gray">
                  {c.groupName} · {c.assigneeName ?? "Unassigned"}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  c.sprintName && !c.badge ? "bg-amber-100 text-amber-700" : "bg-gs-light text-gs-gray"
                }`}
                title={c.badge ? undefined : c.sprintName ? `Currently in ${c.sprintName} — adding moves it here` : `Not in a sprint yet`}
              >
                {c.badge ?? (c.sprintName ? `In ${c.sprintName}` : unsetLabel)}
              </span>
            </label>
          </li>
        ))}
        {visible.length === 0 && <li className="px-3 py-4 text-sm text-gs-gray">No {noun} match your search.</li>}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-gs-gray/10 bg-gs-light/50 px-3 py-2.5">
        <span className="text-xs text-gs-gray">{selected.size} selected</span>
        {footer(selected.size)}
      </div>
    </div>
  );
}

/** "Add existing tasks" on an open sprint. */
function AddTasksPicker({
  candidates,
  action,
  onDone,
}: {
  candidates: SprintCandidate[];
  action: (formData: FormData) => void;
  onDone: () => void;
}) {
  return (
    <ActionForm action={action} successMessage="Added to sprint." onSuccess={onDone} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Add existing tasks to this sprint</p>
        <button type="button" onClick={onDone} className="text-xs text-gs-gray hover:text-gs-black hover:underline">
          Cancel
        </button>
      </div>
      <TaskChecklist
        candidates={candidates}
        footer={(n) => (
          <SubmitButton pendingLabel="Adding…" className="btn btn-primary btn-sm">
            {n > 0 ? `Add ${n} ${n === 1 ? "task" : "tasks"}` : "Add tasks"}
          </SubmitButton>
        )}
      />
    </ActionForm>
  );
}

/** One sprint as an expandable panel: the header row tells you where it stands at a glance; opening
 * it reveals the status breakdown, the sprint's own Kanban board and (for managers) the controls. */
function SprintPanel({
  sprint,
  tasks,
  surfacePath,
  open,
  onToggle,
  canManage,
  candidates,
  updateAction,
  setStatusAction,
  addTasksAction,
}: {
  sprint: SprintRow;
  tasks: ViewTask[];
  surfacePath: string;
  open: boolean;
  onToggle: () => void;
  canManage: boolean;
  candidates: SprintCandidate[];
  updateAction: (id: string, formData: FormData) => void;
  setStatusAction: (id: string, formData: FormData) => void;
  addTasksAction: (id: string, formData: FormData) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const addWithId = addTasksAction.bind(null, sprint.id);
  // Tasks already in THIS sprint can't be added again; a completed sprint takes no new tasks.
  const addable = sprint.status === "COMPLETED" ? [] : candidates.filter((c) => c.sprintId !== sprint.id);
  const updateWithId = updateAction.bind(null, sprint.id);
  const setStatusWithId = setStatusAction.bind(null, sprint.id);
  const panelId = `sprint-panel-${sprint.id}`;

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-colors ${
        open ? "border-gs-gray/30" : "border-gs-gray/15 hover:border-gs-gray/30"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 text-left"
      >
        <Chevron open={open} />
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold leading-snug">{sprint.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[sprint.status]}`}>
              {STATUS_LABEL[sprint.status]}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gs-gray">
            {sprint.startLabel} – {sprint.endLabel}
            <span className={`ml-2 font-medium ${TIMING_STYLE[sprint.timingTone]}`}>{sprint.timingLabel}</span>
            <span className="ml-2">· {sprint.taskCount} {sprint.taskCount === 1 ? "task" : "tasks"}</span>
          </p>
        </div>
        <SprintProgress counts={sprint.counts} className="w-full sm:w-64" />
      </button>

      {open && (
        <div id={panelId} className="border-t border-gs-gray/10">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gs-light/50 px-4 py-3">
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gs-gray">
              <li><span className="font-semibold tabular-nums text-gs-black">{sprint.counts.completed}</span> done</li>
              <li><span className="font-semibold tabular-nums text-gs-black">{sprint.counts.review}</span> in review</li>
              <li><span className="font-semibold tabular-nums text-gs-black">{sprint.counts.inProgress}</span> in progress</li>
              <li><span className="font-semibold tabular-nums text-gs-black">{sprint.counts.notStarted}</span> to do</li>
            </ul>

            {canManage && (
              <div className="flex flex-wrap items-center gap-3">
                {/* One clear next step for where the sprint is, instead of a status dropdown. */}
                <ActionForm
                  action={setStatusWithId}
                  successMessage={NEXT_STEP[sprint.status].done}
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="status" value={NEXT_STEP[sprint.status].to} />
                  <SubmitButton pendingLabel="Saving…" className={`btn btn-sm ${NEXT_STEP[sprint.status].style}`}>
                    {NEXT_STEP[sprint.status].label}
                  </SubmitButton>
                </ActionForm>
                {sprint.status === "ACTIVE" && (
                  <ActionForm action={setStatusWithId} successMessage="Sprint moved back to Planned." className="flex items-center">
                    <input type="hidden" name="status" value="PLANNED" />
                    <SubmitButton
                      pendingLabel="Saving…"
                      className="text-xs font-medium text-gs-gray hover:text-gs-black hover:underline"
                    >
                      Move back to Planned
                    </SubmitButton>
                  </ActionForm>
                )}
                <button
                  type="button"
                  onClick={() => setEditing((e) => !e)}
                  className="text-xs font-medium text-gs-gray hover:text-gs-black hover:underline"
                >
                  {editing ? "Cancel edit" : "Edit sprint"}
                </button>
              </div>
            )}
          </div>

          {canManage && editing && (
            <ActionForm
              action={updateWithId}
              successMessage="Sprint updated."
              onSuccess={() => setEditing(false)}
              className="flex flex-wrap items-end gap-3 border-t border-gs-gray/10 px-4 py-3"
            >
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gs-gray">Name</label>
                <input name="name" defaultValue={sprint.name} required className="field field-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gs-gray">Start</label>
                <input
                  type="date"
                  name="startDate"
                  defaultValue={sprint.startInput}
                  required
                  disabled={sprint.datesLocked}
                  className="field field-sm disabled:bg-gs-light disabled:text-gs-gray"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gs-gray">End</label>
                <input
                  type="date"
                  name="endDate"
                  defaultValue={sprint.endInput}
                  required
                  disabled={sprint.datesLocked}
                  className="field field-sm disabled:bg-gs-light disabled:text-gs-gray"
                />
              </div>
              <SubmitButton pendingLabel="Saving…" className="btn btn-dark btn-sm">
                Save
              </SubmitButton>
              {sprint.datesLocked && (
                <p className="w-full text-xs text-gs-gray">Dates are locked once a Sprint is Active — you can still rename it.</p>
              )}
            </ActionForm>
          )}

          {addable.length > 0 && (
            <div className="border-t border-gs-gray/10 px-4 py-3">
              {!adding ? (
                <button type="button" onClick={() => setAdding(true)} className="btn btn-secondary btn-sm">
                  + Add existing tasks
                </button>
              ) : (
                <AddTasksPicker
                  candidates={addable}
                  action={addWithId}
                  onDone={() => setAdding(false)}
                />
              )}
            </div>
          )}

          <div className="border-t border-gs-gray/10 bg-gs-light/40 p-3 md:p-4">
            <KanbanBoard tasks={tasks} surfacePath={surfacePath} />
            {tasks.length === 0 && (
              <p className="px-1 pt-3 text-sm text-gs-gray">
                No tasks in this sprint yet — add tasks to it from a task&apos;s Sprint field, or when creating one.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The "+ New Sprint" form. Existing tasks can be ticked in the same step, so a new sprint can be
 * created already holding the work that belongs in it. */
function NewSprintForm({
  candidates,
  action,
  onDone,
}: {
  candidates: SprintCandidate[];
  action: (formData: FormData) => void;
  onDone: () => void;
}) {
  const [withTasks, setWithTasks] = useState(false);
  const submit = (n: number) => (
    <SubmitButton pendingLabel="Creating…" className="btn btn-dark btn-sm">
      {n > 0 ? `Create sprint & add ${n} ${n === 1 ? "task" : "tasks"}` : "Create Sprint"}
    </SubmitButton>
  );

  return (
    <ActionForm
      action={action}
      successMessage="Sprint created."
      onSuccess={onDone}
      className="mt-3 flex flex-col gap-4 rounded-xl border border-gs-gray/15 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gs-gray">Name</label>
          <input name="name" placeholder="Sprint 1" required className="field field-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gs-gray">Start</label>
          <input type="date" name="startDate" required className="field field-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gs-gray">End</label>
          <input type="date" name="endDate" required className="field field-sm" />
        </div>
      </div>

      {candidates.length > 0 && withTasks ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Add existing tasks to the new sprint</p>
            <button type="button" onClick={() => setWithTasks(false)} className="text-xs text-gs-gray hover:text-gs-black hover:underline">
              Don&apos;t add tasks
            </button>
          </div>
          <TaskChecklist candidates={candidates} footer={submit} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {submit(0)}
          {candidates.length > 0 && (
            <button type="button" onClick={() => setWithTasks(true)} className="btn btn-secondary btn-sm">
              + Add existing tasks
            </button>
          )}
        </div>
      )}
    </ActionForm>
  );
}

export function SprintsSection({
  sprints,
  tasksBySprint,
  surfacePath,
  defaultOpenId,
  canManage,
  candidates,
  createAction,
  updateAction,
  setStatusAction,
  addTasksAction,
}: {
  sprints: SprintRow[];
  candidates: SprintCandidate[];
  addTasksAction: (id: string, formData: FormData) => void;
  tasksBySprint: Record<string, ViewTask[]>;
  surfacePath: string;
  /** The sprint that starts expanded: the one picked in the URL, else the Active one. */
  defaultOpenId: string | null;
  canManage: boolean;
  createAction: (formData: FormData) => void;
  updateAction: (id: string, formData: FormData) => void;
  setStatusAction: (id: string, formData: FormData) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(defaultOpenId ? [defaultOpenId] : []));

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOpen = sprints.length > 0 && sprints.every((s) => openIds.has(s.id));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          Sprints
          <span className="rounded-full bg-gs-light px-2 py-0.5 text-xs font-semibold tabular-nums text-gs-gray">
            {sprints.length}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {sprints.length > 1 && (
            <button
              type="button"
              onClick={() => setOpenIds(allOpen ? new Set() : new Set(sprints.map((s) => s.id)))}
              className="btn btn-secondary btn-sm"
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          )}
          {canManage && (
            <button type="button" onClick={() => setCreating((c) => !c)} className="btn btn-secondary btn-sm">
              {creating ? "Cancel" : "+ New Sprint"}
            </button>
          )}
        </div>
      </div>

      {canManage && creating && (
        <NewSprintForm candidates={candidates} action={createAction} onDone={() => setCreating(false)} />
      )}

      {sprints.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-gs-gray/30 bg-white p-6 text-sm text-gs-gray">
          No Sprints yet. {canManage ? "Create one to start planning — tasks left unassigned stay in the Backlog." : "Tasks are in the Backlog until a Sprint is planned."}
        </p>
      ) : (
        // One drawer provider for every board, so clicking a card opens the quick-edit drawer.
        <TaskDrawerProvider>
          <div className="mt-3 flex flex-col gap-3">
            {sprints.map((s) => (
              <SprintPanel
                key={s.id}
                sprint={s}
                tasks={tasksBySprint[s.id] ?? []}
                surfacePath={surfacePath}
                open={openIds.has(s.id)}
                onToggle={() => toggle(s.id)}
                canManage={canManage}
                candidates={candidates}
                updateAction={updateAction}
                setStatusAction={setStatusAction}
                addTasksAction={addTasksAction}
              />
            ))}
          </div>
        </TaskDrawerProvider>
      )}
    </div>
  );
}
