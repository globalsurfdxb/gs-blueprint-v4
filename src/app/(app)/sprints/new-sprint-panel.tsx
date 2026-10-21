"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Select } from "@/components/select";
import { createSprint } from "@/lib/actions/sprints";

/**
 * "+ New sprint" on the Sprints page: pick the project, name it, set the dates. Only the projects the
 * person can actually create sprints in are offered. After it is created the sprint appears in the
 * list below; open it to add tasks.
 */
export function NewSprintPanel({ projects }: { projects: { id: string; name: string; clientName: string }[] }) {
  const [open, setOpen] = useState(false);
  if (projects.length === 0) return null;

  return (
    <div className="mt-5">
      <div className="flex justify-end">
        <button type="button" onClick={() => setOpen((o) => !o)} className="btn btn-primary btn-sm" aria-expanded={open}>
          {open ? "Cancel" : "+ New sprint"}
        </button>
      </div>

      {open && (
        <ActionForm
          action={(formData: FormData) => createSprint(String(formData.get("projectId") ?? ""), formData)}
          successMessage="Sprint created."
          onSuccess={() => setOpen(false)}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-gs-gray/15 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="new-sprint-project" className="text-xs font-medium text-gs-gray">Project</label>
            <Select
              id="new-sprint-project"
              name="projectId"
              required
              defaultValue={projects.length === 1 ? projects[0].id : ""}
              className="field field-sm min-w-56"
            >
              <option value="" disabled>Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.clientName}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-sprint-name" className="text-xs font-medium text-gs-gray">Sprint name</label>
            <input id="new-sprint-name" name="name" required placeholder="Sprint 1" className="field field-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-sprint-start" className="text-xs font-medium text-gs-gray">Start</label>
            <input id="new-sprint-start" type="date" name="startDate" required className="field field-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-sprint-end" className="text-xs font-medium text-gs-gray">End</label>
            <input id="new-sprint-end" type="date" name="endDate" required className="field field-sm" />
          </div>
          <SubmitButton pendingLabel="Creating…" className="btn btn-dark btn-sm">
            Create sprint
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
