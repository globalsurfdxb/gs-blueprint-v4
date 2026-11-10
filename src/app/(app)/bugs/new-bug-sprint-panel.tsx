"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Select } from "@/components/select";
import { createBugSprint } from "@/lib/actions/bug-sprints";

/**
 * "+ New bug sprint" on the Bugs page: pick the project, name the batch (Frontend, Backend, Regression retest…) and
 * set its due date. Only projects where the person can manage bug sprints (the bug-tracking Lead, Cluster Head or
 * Admin) are offered; the server re-checks.
 */
export function NewBugSprintPanel({ projects }: { projects: { id: string; name: string; clientName: string }[] }) {
  const [open, setOpen] = useState(false);
  if (projects.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setOpen((o) => !o)} className="btn btn-secondary btn-sm" aria-expanded={open}>
          {open ? "Cancel" : "+ New bug sprint"}
        </button>
      </div>

      {open && (
        <ActionForm
          action={(formData: FormData) => createBugSprint(String(formData.get("projectId") ?? ""), formData)}
          successMessage="Bug sprint created."
          onSuccess={() => setOpen(false)}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-gs-gray/15 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="new-bs-project" className="text-xs font-medium text-gs-gray">Project</label>
            <Select
              id="new-bs-project"
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
            <label htmlFor="new-bs-name" className="text-xs font-medium text-gs-gray">Bug sprint name</label>
            <input id="new-bs-name" name="name" required placeholder="e.g. Frontend" className="field field-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-bs-due" className="text-xs font-medium text-gs-gray">Due date</label>
            <input id="new-bs-due" type="date" name="dueDate" required className="field field-sm" />
          </div>
          <SubmitButton pendingLabel="Creating…" className="btn btn-dark btn-sm">
            Create bug sprint
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
