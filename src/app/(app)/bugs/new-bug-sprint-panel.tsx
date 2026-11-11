"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Select } from "@/components/select";
import { createBugSprint } from "@/lib/actions/bug-sprints";

/**
 * "New bug sprint" button for the Bugs page header: opens a small dialog to pick the project, name the batch
 * (Frontend, Backend, Regression retest…) and set its due date. Only projects where the person can manage bug
 * sprints (the bug-tracking Lead, Cluster Head or Admin) are offered; the server re-checks.
 */
export function NewBugSprintPanel({ projects }: { projects: { id: string; name: string; clientName: string }[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (projects.length === 0) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary">
        + New bug sprint
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="New bug sprint">
            <div className="anim-fade-in absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
            <ActionForm
              action={(formData: FormData) => createBugSprint(String(formData.get("projectId") ?? ""), formData)}
              successMessage="Bug sprint created."
              onSuccess={() => setOpen(false)}
              className="anim-pop relative z-10 flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-6 shadow-lg"
            >
              <div>
                <h2 className="font-heading text-lg font-semibold">New bug sprint</h2>
                <p className="mt-0.5 text-sm text-gs-gray">
                  A named batch of a project&apos;s bugs with a due date, e.g. Frontend, Backend or Regression retest.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="new-bs-project" className="text-[13px] font-medium text-gs-black/80">
                  Project <span className="text-gs-red">*</span>
                </label>
                <Select
                  id="new-bs-project"
                  name="projectId"
                  required
                  defaultValue={projects.length === 1 ? projects[0].id : ""}
                  className="field"
                >
                  <option value="" disabled>Select a project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} · {p.clientName}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="new-bs-name" className="text-[13px] font-medium text-gs-black/80">
                    Name <span className="text-gs-red">*</span>
                  </label>
                  <input id="new-bs-name" name="name" required placeholder="e.g. Frontend" className="field" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="new-bs-due" className="text-[13px] font-medium text-gs-black/80">
                    Due date <span className="text-gs-red">*</span>
                  </label>
                  <input id="new-bs-due" type="date" name="dueDate" required className="field" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <SubmitButton pendingLabel="Creating…" className="btn btn-primary min-w-32">
                  Create bug sprint
                </SubmitButton>
              </div>
            </ActionForm>
          </div>,
          document.body,
        )}
    </>
  );
}
