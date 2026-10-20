"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createTaskInDrawer } from "@/lib/actions/tasks";
import { TaskTypeProvider } from "@/components/task-type-context";
import { TaskTypeFields } from "@/components/task-type-fields";
import { AssigneeField } from "@/components/assignee-field";
import type { TaskCreateOptions } from "@/lib/actions/task-create";

const fieldClass =
  "field";

/**
 * Create half of the unified task drawer (final build). Same right-side slide-over as the edit
 * drawer, agency-wide. The Project is chosen through a picker (never a raw id); the Task Group,
 * assignee pool, bug fields and Sprint field are all driven by the server-resolved options for the
 * selected project — the write goes through createTaskInDrawer, which re-checks every rule.
 */
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-gs-gray">{label}</span>
      <div
        className="rounded-md border border-gs-gray/20 bg-gs-light px-3 py-2 text-sm text-gs-black/80"
        aria-readonly="true"
        title="Fixed — this task is being created in the selected project"
      >
        {value}
      </div>
    </div>
  );
}

export function CreateTaskPanel({
  projects,
  projectLocked,
  options,
  loading,
  initialGroupId,
  onProjectChange,
  onClose,
  onCreated,
}: {
  projects: { id: string; name: string; clientName: string }[] | null;
  /** True when opened from inside a project — Project Name and Cluster render as fixed fields. */
  projectLocked: boolean;
  options: TaskCreateOptions | null;
  loading: boolean;
  initialGroupId: string | null;
  onProjectChange: (projectId: string) => void;
  onClose: () => void;
  onCreated: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="anim-fade-in absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div className="anim-slide-right relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-gs-gray/15 bg-white px-5 py-4">
          <div className="flex-1">
            <h2 className="text-base font-semibold">New Task</h2>
            {projectLocked ? (
              // Created from inside a project: Project Name and Cluster are fixed context, not
              // choices — shown read-only so the task can't be filed somewhere else by mistake.
              <div className="mt-2 grid grid-cols-2 gap-3">
                <ReadOnlyField label="Project Name" value={options ? options.projectName : "…"} />
                <ReadOnlyField label="Cluster" value={options ? options.clusterName : "…"} />
              </div>
            ) : (
              // Cross-project surface (My Tasks): a dropdown of the user's own projects; switching
              // re-loads that project's groups/assignees. Cluster follows the chosen project.
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="create-project" className="text-xs font-medium uppercase tracking-wide text-gs-gray">
                    Project
                  </label>
                  {projects && projects.length > 0 ? (
                    <select
                      id="create-project"
                      value={options?.projectId ?? ""}
                      onChange={(e) => onProjectChange(e.target.value)}
                      className={fieldClass}
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} · {p.clientName}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm">{options ? `${options.projectName} · ${options.clientName}` : "…"}</p>
                  )}
                </div>
                {options && <ReadOnlyField label="Cluster" value={options.clusterName} />}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 text-lg leading-none text-gs-gray hover:text-gs-black">✕</button>
        </div>

        {loading || !options ? (
          <div className="p-6 text-sm text-gs-gray">Loading…</div>
        ) : options.groups.length === 0 ? (
          <div className="p-6 text-sm text-gs-gray">You don&apos;t have permission to create a task on this project.</div>
        ) : (
          // Keyed on the project so switching projects remounts the form and its default group /
          // task type recompute from the new options — no resetting effect needed.
          <CreateForm key={options.projectId} options={options} initialGroupId={initialGroupId} onCreated={onCreated} />
        )}
      </div>
    </div>
  );
}

function CreateForm({
  options,
  initialGroupId,
  onCreated,
}: {
  options: TaskCreateOptions;
  initialGroupId: string | null;
  onCreated: () => void;
}) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => {
    const groups = options.groups;
    const preferred = initialGroupId && groups.some((g) => g.id === initialGroupId) ? initialGroupId : "";
    return preferred || (groups.length === 1 ? groups[0].id : "");
  });
  const selectedGroup = options.groups.find((g) => g.id === selectedGroupId) ?? null;

  return (
    <ActionForm
      action={createTaskInDrawer.bind(null, options.projectId)}
      successMessage="Task created."
      onSuccess={onCreated}
      className="flex flex-col gap-4 px-5 py-4"
    >
      {/* Task Group — a picker when the user has authority in more than one here. */}
      {options.groups.length === 1 ? (
        <input type="hidden" name="groupId" value={options.groups[0].id} />
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="create-group" className="text-sm font-medium">Task Group</label>
          <select
            id="create-group"
            name="groupId"
            required
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className={fieldClass}
          >
            <option value="" disabled>Select a Task Group</option>
            {options.groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name} · {g.leadName}</option>
            ))}
          </select>
        </div>
      )}

      {!selectedGroup ? (
        <p className="text-sm text-gs-gray">Select a Task Group to continue.</p>
      ) : (
        // Keyed on the group so the Task Type resets to Standard when the group changes.
        <TaskTypeProvider key={selectedGroup.id}>
          {selectedGroup.bugTrackingEnabled && <TaskTypeFields />}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="create-name" className="text-sm font-medium">Task Name</label>
            <input id="create-name" name="name" required className={fieldClass} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="create-desc" className="text-sm font-medium">
              Description <span className="text-gs-gray">(optional)</span>
            </label>
            <textarea id="create-desc" name="description" rows={3} className={fieldClass} />
          </div>

          <AssigneeField
            assignees={selectedGroup.assignees}
            leadId={selectedGroup.leadId}
            leadName={selectedGroup.leadName}
            bugTrackingEnabled={selectedGroup.bugTrackingEnabled}
          />

          {selectedGroup.canManageSprint && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="create-sprint" className="text-sm font-medium">
                Sprint <span className="text-gs-gray">(optional)</span>
              </label>
              <select id="create-sprint" name="sprintId" defaultValue="" className={fieldClass}>
                <option value="">Backlog (no sprint)</option>
                {selectedGroup.sprints.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.status === "ACTIVE" ? " · Active" : ""}</option>
                ))}
              </select>
              {selectedGroup.sprints.length === 0 && (
                <p className="text-xs text-gs-gray">
                  No open sprints on this project yet — a Lead creates one from the project page, then tasks can be added to it.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="create-priority" className="text-sm font-medium">Priority</label>
              <select id="create-priority" name="priority" defaultValue="MEDIUM" className={fieldClass}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="create-due" className="text-sm font-medium">Due Date</label>
              <input id="create-due" name="dueDate" type="date" required className={fieldClass} />
            </div>
          </div>

          <SubmitButton
            pendingLabel="Creating…"
            className="btn btn-primary mt-2"
          >
            Create Task
          </SubmitButton>
        </TaskTypeProvider>
      )}
    </ActionForm>
  );
}
