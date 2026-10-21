"use client";

import { createContext, useContext, useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { getTaskDrawerData, type TaskDrawerData } from "@/lib/actions/task-drawer";
import { changeTaskStatusByDrag } from "@/lib/actions/task-status";
import { reassignTask } from "@/lib/actions/tasks";
import { setTaskSprint } from "@/lib/actions/sprints";
import { setTaskPriority, setTaskSeverity } from "@/lib/actions/task-attributes";
import { addComment } from "@/lib/actions/comments";
import { getCreatableProjects, getTaskCreateOptions, type TaskCreateOptions } from "@/lib/actions/task-create";
import { CreateTaskPanel } from "@/components/create-task-panel";
import { formatLocalDate, formatLocalTime } from "@/lib/timezone";
import { isFailure, noticeOf, readableError } from "@/lib/action-result";
import { Select } from "@/components/select";

// Quick-edit task drawer. A right-side slide-over rendered over the current view — opening it
// does NOT navigate, so the underlying view's scroll position and filters are preserved. Inline
// edit of Status, Assignee, Severity, Sprint, Priority and Comments; everything heavier stays one
// click away via "Open full view". Works for tasks AND bugs across every discipline: fields that
// only apply to some work self-hide (Severity on bugs only, Sprint where Sprint Workflow is on),
// and the drawer is cross-project — each opened task carries its own project context — so the same
// provider serves both the single-project board and the cross-project My Tasks surface.

type DrawerApi = {
  /** Open the edit drawer for an existing task. */
  openTask: (taskId: string) => void;
  /** Open the create drawer. Pass a project (and optionally a group) to pre-select it; with no
   * project the picker defaults to the user's first creatable project. */
  openCreate: (projectId?: string, groupId?: string, opts?: { bug?: boolean }) => void;
};
const TaskDrawerContext = createContext<DrawerApi | null>(null);
/** Returns the drawer API, or null when no drawer provider is mounted — callers fall back to
 * normal full-page navigation in that case. */
export function useTaskDrawer(): DrawerApi | null {
  return useContext(TaskDrawerContext);
}

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const PRIORITY_LABELS: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };
const SEVERITY_LABELS: Record<string, string> = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const selectClass = "field field-sm w-full";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-gs-gray">{label}</span>
      {children}
    </label>
  );
}

export function TaskDrawerProvider({ children }: { children: React.ReactNode }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [data, setData] = useState<TaskDrawerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [commentText, setCommentText] = useState("");
  // Create mode (final build): the same slide-over, in create rather than edit form.
  const [creating, setCreating] = useState(false);
  const [createOptions, setCreateOptions] = useState<TaskCreateOptions | null>(null);
  const [createProjects, setCreateProjects] = useState<{ id: string; name: string; clientName: string }[] | null>(null);
  const [createInitialGroupId, setCreateInitialGroupId] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createProjectLocked, setCreateProjectLocked] = useState(false);
  const [createBugMode, setCreateBugMode] = useState(false);
  const { addToast } = useToast();
  const router = useRouter();

  const load = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const result = await getTaskDrawerData(id);
        if (isFailure(result)) {
          addToast(result.error, "error");
          setTaskId(null);
        } else {
          setData(result);
        }
      } catch (e) {
        addToast(readableError(e), "error");
        setTaskId(null);
      } finally {
        setLoading(false);
      }
    },
    [addToast],
  );

  const openTask = useCallback(
    (id: string) => {
      setCreating(false); // edit and create are mutually exclusive
      setTaskId(id);
      setData(null);
      setCommentText("");
      void load(id);
    },
    [load],
  );

  const close = useCallback(() => {
    setTaskId(null);
    setData(null);
  }, []);

  const closeCreate = useCallback(() => {
    setCreating(false);
    setCreateOptions(null);
    setCreateInitialGroupId(null);
  }, []);

  // Opened from inside a project (projectId given): the task belongs to THAT project, so the panel
  // shows Project Name and Cluster as fixed, read-only fields. Opened from a cross-project surface
  // (My Tasks): a picker limited to the user's own projects.
  const openCreate = useCallback(
    (projectId?: string, groupId?: string, opts?: { bug?: boolean }) => {
      setTaskId(null);
      setData(null);
      setCreating(true);
      setCreateBugMode(!!opts?.bug);
      setCreateProjectLocked(!!projectId);
      setCreateInitialGroupId(groupId ?? null);
      setCreateOptions(null);
      setCreateProjects(null);
      setCreateLoading(true);
      void (async () => {
        try {
          let pid = projectId;
          if (!pid) {
            const projs = await getCreatableProjects({ bugsOnly: !!opts?.bug });
            if (isFailure(projs)) {
              addToast(projs.error, "error");
              setCreating(false);
              return;
            }
            setCreateProjects(projs);
            pid = projs[0]?.id;
            if (!pid) {
              addToast("You aren't assigned to any project you can add a task to yet.", "error");
              setCreating(false);
              return;
            }
          }
          const options = await getTaskCreateOptions(pid);
          if (isFailure(options)) {
            addToast(options.error, "error");
            setCreating(false);
            return;
          }
          setCreateOptions(options);
        } catch (e) {
          addToast(readableError(e), "error");
          setCreating(false);
        } finally {
          setCreateLoading(false);
        }
      })();
    },
    [addToast],
  );

  const changeCreateProject = useCallback(
    (projectId: string) => {
      setCreateOptions(null);
      setCreateInitialGroupId(null);
      setCreateLoading(true);
      getTaskCreateOptions(projectId)
        .then((options) => {
          if (isFailure(options)) addToast(options.error, "error");
          else setCreateOptions(options);
        })
        .catch((e) => addToast(readableError(e), "error"))
        .finally(() => setCreateLoading(false));
    },
    [addToast],
  );

  const onCreated = useCallback(() => {
    closeCreate();
    router.refresh();
  }, [closeCreate, router]);

  // Every inline edit runs through here: perform the mutation, re-fetch the drawer's own data,
  // and refresh the underlying view (RSC) so the board/list reflects the change too.
  // Server actions return { ok: false, error } for an expected problem; that message is shown as a
  // toast and the drawer reloads so a rejected change snaps back to the real value (QA A-01, E-02).
  function runEdit(fn: () => Promise<unknown>, onDone?: () => void) {
    startTransition(async () => {
      try {
        const result = await fn();
        if (isFailure(result)) {
          addToast(result.error, "error");
        } else {
          const notice = noticeOf(result);
          if (notice) addToast(notice, "success");
          onDone?.();
        }
        if (taskId) await load(taskId);
        router.refresh();
      } catch (e) {
        addToast(readableError(e), "error");
        if (taskId) await load(taskId);
      }
    });
  }

  function submitComment() {
    const text = commentText.trim();
    if (!text || !taskId || !data) return;
    const projectId = data.projectId;
    runEdit(() => addComment(projectId, taskId, fd({ text })), () => setCommentText(""));
  }

  return (
    <TaskDrawerContext.Provider value={{ openTask, openCreate }}>
      {children}
      {creating && (
        <CreateTaskPanel
          projects={createProjects}
          projectLocked={createProjectLocked}
          bugMode={createBugMode}
          options={createOptions}
          loading={createLoading}
          initialGroupId={createInitialGroupId}
          onProjectChange={changeCreateProject}
          onClose={closeCreate}
          onCreated={onCreated}
        />
      )}
      {taskId && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          <div className="anim-fade-in absolute inset-0 bg-black/30" onClick={close} aria-hidden />
          <div className="anim-slide-right relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
            {!data || loading ? (
              <div className="p-6 text-sm text-gs-gray">Loading…</div>
            ) : (
              <>
                <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-gs-gray/15 bg-white px-5 py-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold leading-snug">{data.name}</h2>
                      {data.taskType === "BUG" && (
                        <span className="rounded-full bg-gs-red/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-gs-red">Bug</span>
                      )}
                      {data.hasChain && (
                        <span className="rounded-full bg-gs-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase">Round {data.round}</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gs-gray">
                      {data.projectName} · {data.clientName}
                      {data.discipline ? ` · ${data.discipline}` : ""}
                    </p>
                  </div>
                  <button type="button" onClick={close} aria-label="Close" className="shrink-0 text-lg leading-none text-gs-gray hover:text-gs-black">✕</button>
                </div>

                <div className={`flex flex-col gap-4 px-5 py-4 ${pending ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between text-xs text-gs-gray">
                    <span>Due {data.dueDateLabel}</span>
                    <span>{data.taskType === "BUG" ? "Reopens" : "Revisions"}: {data.revisionCount}</span>
                  </div>

                  <Field label="Status">
                    {data.statusOptions.length > 1 ? (
                      <Select
                        className={selectClass}
                        disabled={pending}
                        value={data.status}
                        onChange={(e) => {
                          const target = e.target.value;
                          if (target && target !== data.status) {
                            runEdit(() => changeTaskStatusByDrag(data.id, target, `/projects/${data.projectId}`));
                          }
                        }}
                      >
                        {data.statusOptions.map((o) => (
                          <option key={`${o.value}-${o.label}`} value={o.value} disabled={o.disabled}>
                            {o.label}
                            {o.hint ? ` — ${o.hint}` : ""}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      // Nothing this user may change it to — show the status instead of a dropdown
                      // full of moves that would only be refused (QA B-02, E-01).
                      <p className="text-sm">{data.statusLabel}</p>
                    )}
                  </Field>

                  {data.canReassign && (
                    <Field label={data.reassignBugMode ? "Assignee (hand bug to)" : "Assignee"}>
                      <Select
                        className={selectClass}
                        disabled={pending}
                        value={data.assignedToId ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v && v !== data.assignedToId) runEdit(() => reassignTask(data.id, fd({ assignedToId: v })));
                        }}
                      >
                        {/* The current assignee stays as the selected label; every other option is a
                            different person (QA F-01 — same person = Send to Revision). */}
                        {data.assignees.map((a) => (
                          <option key={a.id} value={a.id} disabled={a.id === data.assignedToId}>
                            {a.name}
                            {a.id === data.assignedToId ? " (current)" : ""}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  {!data.canReassign && (
                    <Field label="Assignee">
                      <p className="text-sm">{data.assignedToName ?? "Unassigned"}</p>
                    </Field>
                  )}

                  <Field label="Priority">
                    {data.canEditAttributes ? (
                      <Select
                        className={selectClass}
                        disabled={pending}
                        value={data.priority}
                        onChange={(e) => runEdit(() => setTaskPriority(data.id, fd({ priority: e.target.value })))}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                        ))}
                      </Select>
                    ) : (
                      <p className="text-sm">{PRIORITY_LABELS[data.priority] ?? data.priority}</p>
                    )}
                  </Field>

                  {data.taskType === "BUG" && (
                    <Field label="Severity">
                      {data.canEditAttributes ? (
                        <Select
                          className={selectClass}
                          disabled={pending}
                          value={data.severity ?? ""}
                          onChange={(e) => runEdit(() => setTaskSeverity(data.id, fd({ severity: e.target.value })))}
                        >
                          {data.severity === null && <option value="">—</option>}
                          {SEVERITIES.map((s) => (
                            <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
                          ))}
                        </Select>
                      ) : (
                        <p className="text-sm">{data.severity ? SEVERITY_LABELS[data.severity] : "—"}</p>
                      )}
                    </Field>
                  )}

                  {data.canManageSprint && (
                    <Field label="Sprint">
                      <Select
                        className={selectClass}
                        disabled={pending}
                        value={data.sprintId ?? ""}
                        onChange={(e) => runEdit(() => setTaskSprint(data.id, fd({ sprintId: e.target.value })))}
                      >
                        <option value="">Backlog (no sprint)</option>
                        {data.sprints.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}{s.status === "ACTIVE" ? " · Active" : s.status === "COMPLETED" ? " · Completed" : ""}</option>
                        ))}
                      </Select>
                      {data.sprints.length === 0 && (
                        <span className="text-xs text-gs-gray">
                          No open sprints yet — a Lead creates one from the project page.
                        </span>
                      )}
                    </Field>
                  )}

                  {/* Comments — add + view inline; edit/delete stay in the full view. */}
                  <div className="mt-1 border-t border-gs-gray/10 pt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gs-gray">Comments</p>
                    <div className="mt-2 flex flex-col gap-2">
                      {data.comments.length === 0 ? (
                        <p className="text-sm text-gs-gray">No comments yet.</p>
                      ) : (
                        data.comments.map((c) => (
                          <div key={c.id} className="rounded-md border border-gs-gray/15 px-3 py-2 text-sm">
                            <p className="text-[11px] text-gs-gray">
                              {c.author.name} · {formatLocalDate(new Date(c.createdAt), data.viewerLocation)} {formatLocalTime(new Date(c.createdAt), data.viewerLocation)}{c.isEdited ? " · edited" : ""}
                            </p>
                            <p className="mt-0.5 whitespace-pre-wrap">{c.text}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      rows={2}
                      placeholder="Add a comment…"
                      className="field field-sm mt-2 w-full py-1.5"
                    />
                    <button
                      type="button"
                      onClick={submitComment}
                      disabled={pending || !commentText.trim()}
                      className="btn btn-dark btn-sm mt-1"
                    >
                      Comment
                    </button>
                  </div>

                  <Link
                    href={data.fullViewHref}
                    className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-gs-red hover:underline"
                  >
                    Open full view ↗
                  </Link>
                  <p className="text-[11px] text-gs-gray">
                    Subtasks, timer, cross-group handoff, bug images and content live in the full view.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </TaskDrawerContext.Provider>
  );
}

/** Renders a task title as either a drawer trigger (whenever a drawer provider is mounted) or a
 * normal link to the full page (when it isn't). Shared by the List/Kanban/Calendar surfaces and
 * My Tasks. */
export function TaskOpener({
  taskId,
  projectId,
  className,
  children,
}: {
  taskId: string;
  projectId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const api = useTaskDrawer();
  if (api) {
    return (
      <button type="button" onClick={() => api.openTask(taskId)} className={className}>
        {children}
      </button>
    );
  }
  return (
    <Link href={`/projects/${projectId}/tasks/${taskId}`} className={className}>
      {children}
    </Link>
  );
}
