"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { BUG_PROGRESS_LABELS, SprintProgress } from "@/components/sprint-progress";
import { KanbanBoard, type ViewTask } from "@/components/task-views";
import { TaskDrawerProvider, useTaskDrawer } from "@/components/task-drawer";
import type { SprintCounts } from "@/lib/sprint-dashboard";
import { Select } from "@/components/select";
import { Chevron, TaskChecklist, type SprintCandidate } from "./sprints-section";

/** A bug sprint as the Bugs tab shows it — a named batch of the project's bugs (Frontend, Backend,
 * Regression Retesting…) with a due date. `isBucket` marks the catch-all "Not in a bug sprint" row. */
export type BugSprintRow = {
  id: string;
  name: string;
  isBucket?: boolean;
  dueLabel: string;
  dueInput: string;
  bugCount: number;
  counts: SprintCounts;
  /** "5 days left", "Due today", "Overdue by 2 days" — computed on the server. */
  timingLabel: string;
  timingTone: "ok" | "warn" | "late" | "muted";
};

const TIMING_STYLE: Record<BugSprintRow["timingTone"], string> = {
  ok: "text-green-700",
  warn: "text-amber-600",
  late: "text-gs-red",
  muted: "text-gs-gray",
};

/** Quick picks for the name — bug sprints are usually a category of the work. */
const NAME_SUGGESTIONS = ["Frontend", "Backend", "Regression Retesting", "UAT", "Hotfix"];

function BugSprintPanel({
  sprint,
  bugs,
  projectId,
  surfacePath,
  open,
  onToggle,
  canManage,
  canReport,
  candidates,
  assignable,
  assigneeOptions,
  updateAction,
  deleteAction,
  addBugsAction,
  assignAction,
}: {
  sprint: BugSprintRow;
  bugs: ViewTask[];
  projectId: string;
  surfacePath: string;
  open: boolean;
  onToggle: () => void;
  canManage: boolean;
  canReport: boolean;
  candidates: SprintCandidate[];
  /** Open bugs the viewer may assign (their team's), and the team members they can be assigned to. */
  assignable: SprintCandidate[];
  assigneeOptions: { id: string; name: string }[];
  updateAction: (id: string, formData: FormData) => void;
  deleteAction: (id: string, formData: FormData) => void;
  addBugsAction: (id: string, formData: FormData) => void;
  assignAction: (formData: FormData) => void;
}) {
  const drawer = useTaskDrawer();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const panelId = `bug-sprint-panel-${sprint.id}`;
  const real = !sprint.isBucket;
  // Bugs already in THIS bug sprint can't be added again.
  const addable = real ? candidates.filter((c) => c.sprintId !== sprint.id) : [];
  // The bugs of THIS panel that can be handed to a team member.
  const assignHere = assignable.filter((c) => (real ? c.sprintId === sprint.id : c.sprintId === null));

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
            <span className={`text-[15px] font-semibold leading-snug ${real ? "" : "text-gs-gray"}`}>{sprint.name}</span>
          </div>
          <p className="mt-0.5 text-xs text-gs-gray">
            {real && (
              <>
                Due {sprint.dueLabel}
                <span className={`ml-2 font-medium ${TIMING_STYLE[sprint.timingTone]}`}>{sprint.timingLabel}</span>
                <span className="ml-2">·</span>{" "}
              </>
            )}
            {sprint.bugCount} {sprint.bugCount === 1 ? "bug" : "bugs"}
          </p>
        </div>
        <SprintProgress counts={sprint.counts} labels={BUG_PROGRESS_LABELS} className="w-full sm:w-64" />
      </button>

      {open && (
        <div id={panelId} className="border-t border-gs-gray/10">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gs-light/50 px-4 py-3">
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gs-gray">
              <li><span className="font-semibold tabular-nums text-gs-black">{sprint.counts.completed}</span> closed</li>
              <li><span className="font-semibold tabular-nums text-gs-black">{sprint.counts.review}</span> ready for retest</li>
              <li><span className="font-semibold tabular-nums text-gs-black">{sprint.counts.inProgress}</span> in progress</li>
              <li><span className="font-semibold tabular-nums text-gs-black">{sprint.counts.notStarted}</span> open</li>
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              {canReport && drawer && (
                <button
                  type="button"
                  onClick={() => drawer.openCreate(projectId, undefined, { bug: true, bugSprintId: real ? sprint.id : undefined })}
                  className="btn btn-primary btn-sm"
                >
                  + Report bug{real ? " here" : ""}
                </button>
              )}
              {assignHere.length > 0 && assigneeOptions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAssigning((a) => !a)}
                  className="btn btn-secondary btn-sm"
                >
                  {assigning ? "Cancel assigning" : "Assign bugs"}
                </button>
              )}
              {canManage && real && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing((e) => !e);
                      setConfirmDelete(false);
                    }}
                    className="text-xs font-medium text-gs-gray hover:text-gs-black hover:underline"
                  >
                    {editing ? "Cancel edit" : "Edit"}
                  </button>
                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDelete(true);
                        setEditing(false);
                      }}
                      className="text-xs font-medium text-gs-red hover:underline"
                    >
                      Delete
                    </button>
                  ) : (
                    <ActionForm
                      action={deleteAction.bind(null, sprint.id)}
                      successMessage="Bug sprint deleted."
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="text-xs text-gs-gray">
                        Delete this bug sprint? Its bugs stay on the project.
                      </span>
                      <SubmitButton pendingLabel="Deleting…" className="btn btn-sm btn-dark">
                        Yes, delete
                      </SubmitButton>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="text-xs text-gs-gray hover:text-gs-black hover:underline"
                      >
                        Keep
                      </button>
                    </ActionForm>
                  )}
                </>
              )}
            </div>
          </div>

          {canManage && real && editing && (
            <ActionForm
              action={updateAction.bind(null, sprint.id)}
              successMessage="Bug sprint updated."
              onSuccess={() => setEditing(false)}
              className="flex flex-wrap items-end gap-3 border-t border-gs-gray/10 px-4 py-3"
            >
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gs-gray">Name</label>
                <input name="name" defaultValue={sprint.name} required maxLength={80} className="field field-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gs-gray">Due date</label>
                <input type="date" name="dueDate" defaultValue={sprint.dueInput} required className="field field-sm" />
              </div>
              <SubmitButton pendingLabel="Saving…" className="btn btn-dark btn-sm">
                Save
              </SubmitButton>
            </ActionForm>
          )}

          {assigning && assignHere.length > 0 && (
            <ActionForm
              action={assignAction}
              successMessage="Bugs assigned."
              onSuccess={() => setAssigning(false)}
              className="flex flex-col gap-2 border-t border-gs-gray/10 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Select bugs and assign them to a team member</p>
                <button type="button" onClick={() => setAssigning(false)} className="text-xs text-gs-gray hover:text-gs-black hover:underline">
                  Cancel
                </button>
              </div>
              <TaskChecklist
                candidates={assignHere}
                noun="bugs"
                footer={(n) => (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Select name="assignedToId" required defaultValue="" className="field field-sm min-w-44" aria-label="Assign to">
                      <option value="" disabled>Assign to…</option>
                      {assigneeOptions.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </Select>
                    <SubmitButton pendingLabel="Assigning…" className="btn btn-primary btn-sm">
                      {n > 0 ? `Assign ${n} ${n === 1 ? "bug" : "bugs"}` : "Assign bugs"}
                    </SubmitButton>
                  </div>
                )}
              />
            </ActionForm>
          )}

          {real && addable.length > 0 && (
            <div className="border-t border-gs-gray/10 px-4 py-3">
              {!adding ? (
                <button type="button" onClick={() => setAdding(true)} className="btn btn-secondary btn-sm">
                  + Add existing bugs
                </button>
              ) : (
                <ActionForm
                  action={addBugsAction.bind(null, sprint.id)}
                  successMessage="Added to bug sprint."
                  onSuccess={() => setAdding(false)}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">Add existing bugs to this bug sprint</p>
                    <button type="button" onClick={() => setAdding(false)} className="text-xs text-gs-gray hover:text-gs-black hover:underline">
                      Cancel
                    </button>
                  </div>
                  <TaskChecklist
                    candidates={addable}
                    noun="bugs"
                    unsetLabel="No bug sprint"
                    footer={(n) => (
                      <SubmitButton pendingLabel="Adding…" className="btn btn-primary btn-sm">
                        {n > 0 ? `Add ${n} ${n === 1 ? "bug" : "bugs"}` : "Add bugs"}
                      </SubmitButton>
                    )}
                  />
                </ActionForm>
              )}
            </div>
          )}

          <div className="border-t border-gs-gray/10 bg-gs-light/40 p-3 md:p-4">
            <KanbanBoard kind="bug" tasks={bugs} surfacePath={surfacePath} />
            {bugs.length === 0 && (
              <p className="px-1 pt-3 text-sm text-gs-gray">
                {real
                  ? "No bugs in this bug sprint yet — report one here, or add existing bugs."
                  : "Every bug is filed under a bug sprint."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** "+ New bug sprint": a name (a category such as Frontend or Regression Retesting) and a due date. */
function NewBugSprintForm({ action, onDone }: { action: (formData: FormData) => void; onDone: () => void }) {
  const [name, setName] = useState("");
  return (
    <ActionForm
      action={action}
      successMessage="Bug sprint created."
      onSuccess={onDone}
      className="mt-3 flex flex-col gap-3 rounded-xl border border-gs-gray/15 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="new-bug-sprint-name" className="text-xs font-medium text-gs-gray">Category / name</label>
          <input
            id="new-bug-sprint-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Frontend"
            required
            maxLength={80}
            className="field field-sm w-64"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="new-bug-sprint-due" className="text-xs font-medium text-gs-gray">Due date</label>
          <input id="new-bug-sprint-due" type="date" name="dueDate" required className="field field-sm" />
        </div>
        <SubmitButton pendingLabel="Creating…" className="btn btn-dark btn-sm">
          Create bug sprint
        </SubmitButton>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gs-gray">Quick pick:</span>
        {NAME_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setName(s)}
            className="rounded-full border border-gs-gray/25 px-2.5 py-0.5 text-xs text-gs-gray hover:border-gs-gray/50 hover:text-gs-black"
          >
            {s}
          </button>
        ))}
      </div>
    </ActionForm>
  );
}

export function BugsSection({
  projectId,
  sprints,
  bugsBySprint,
  surfacePath,
  canManage,
  canReport,
  defaultOpenId,
  candidates,
  assignable,
  assigneeOptions,
  createAction,
  updateAction,
  deleteAction,
  addBugsAction,
  assignAction,
}: {
  projectId: string;
  /** Bug sprints soonest-due first, then the "Not in a bug sprint" bucket last (only when it has bugs). */
  sprints: BugSprintRow[];
  bugsBySprint: Record<string, ViewTask[]>;
  surfacePath: string;
  canManage: boolean;
  canReport: boolean;
  /** The bug sprint to start expanded (picked from the Bugs menu via ?bugSprint=); else the first with open work. */
  defaultOpenId?: string | null;
  candidates: SprintCandidate[];
  assignable: SprintCandidate[];
  assigneeOptions: { id: string; name: string }[];
  createAction: (formData: FormData) => void;
  updateAction: (id: string, formData: FormData) => void;
  deleteAction: (id: string, formData: FormData) => void;
  addBugsAction: (id: string, formData: FormData) => void;
  assignAction: (formData: FormData) => void;
}) {
  const [creating, setCreating] = useState(false);
  // Start with the first bug sprint that still has open work open; else the first row.
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const first =
      sprints.find((s) => s.id === defaultOpenId) ??
      sprints.find((s) => !s.isBucket && s.counts.total > s.counts.completed) ??
      sprints[0];
    return new Set(first ? [first.id] : []);
  });

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOpen = sprints.length > 0 && sprints.every((s) => openIds.has(s.id));
  const realCount = sprints.filter((s) => !s.isBucket).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          Bug sprints
          <span className="rounded-full bg-gs-light px-2 py-0.5 text-xs font-semibold tabular-nums text-gs-gray">{realCount}</span>
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
              {creating ? "Cancel" : "+ New bug sprint"}
            </button>
          )}
        </div>
      </div>

      {canManage && creating && <NewBugSprintForm action={createAction} onDone={() => setCreating(false)} />}

      {sprints.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-gs-gray/30 bg-white p-6 text-sm text-gs-gray">
          No bugs or bug sprints yet.{" "}
          {canManage
            ? "Create a bug sprint — a category such as Frontend, Backend or Regression Retesting, with a due date — then report bugs into it."
            : "Bugs appear here once they're reported on this project."}
        </p>
      ) : (
        // One drawer provider for every board, so clicking a card opens the quick-edit drawer.
        <TaskDrawerProvider>
          <div className="mt-3 flex flex-col gap-3">
            {sprints.map((s) => (
              <BugSprintPanel
                key={s.id}
                sprint={s}
                bugs={bugsBySprint[s.id] ?? []}
                projectId={projectId}
                surfacePath={surfacePath}
                open={openIds.has(s.id)}
                onToggle={() => toggle(s.id)}
                canManage={canManage}
                canReport={canReport}
                candidates={candidates}
                assignable={assignable}
                assigneeOptions={assigneeOptions}
                updateAction={updateAction}
                deleteAction={deleteAction}
                addBugsAction={addBugsAction}
                assignAction={assignAction}
              />
            ))}
          </div>
        </TaskDrawerProvider>
      )}
    </div>
  );
}
