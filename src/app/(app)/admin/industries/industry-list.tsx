"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";

export type IndustryRow = { id: string; name: string; clientCount: number };

export function IndustryList({
  industries,
  createAction,
  renameAction,
  deleteAction,
}: {
  industries: IndustryRow[];
  createAction: (formData: FormData) => unknown;
  renameAction: (id: string, formData: FormData) => unknown;
  deleteAction: (id: string, formData: FormData) => unknown;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="mt-6 flex flex-col gap-4">
      <ActionForm
        action={createAction}
        successMessage="Industry added."
        className="flex flex-wrap items-end gap-3 rounded-lg border border-gs-gray/15 bg-white p-4"
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="new-industry" className="text-sm font-medium">New industry</label>
          <input id="new-industry" name="name" required maxLength={80} placeholder="e.g. Healthcare" className="field" />
        </div>
        <SubmitButton pendingLabel="Adding…" className="btn btn-primary">
          Add Industry
        </SubmitButton>
      </ActionForm>

      <div className="overflow-hidden rounded-lg border border-gs-gray/15 bg-white">
        {industries.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gs-gray">No industries yet — add the first one above.</p>
        ) : (
          <ul>
            {industries.map((i) => (
              <li key={i.id} className="border-b border-gs-gray/10 last:border-b-0">
                {editingId === i.id ? (
                  <ActionForm
                    action={renameAction.bind(null, i.id)}
                    successMessage="Industry renamed."
                    onSuccess={() => setEditingId(null)}
                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                  >
                    <input name="name" required maxLength={80} defaultValue={i.name} className="field field-sm flex-1" aria-label="Industry name" />
                    <SubmitButton pendingLabel="Saving…" className="btn btn-dark btn-sm">
                      Save
                    </SubmitButton>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs text-gs-gray hover:underline">
                      Cancel
                    </button>
                  </ActionForm>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex-1 text-sm font-medium">{i.name}</span>
                    <span className="text-xs text-gs-gray">
                      {i.clientCount} client{i.clientCount === 1 ? "" : "s"}
                    </span>
                    <button type="button" onClick={() => setEditingId(i.id)} className="px-1 text-xs text-gs-gray hover:text-gs-black hover:underline">
                      Edit
                    </button>
                    <ActionForm
                      action={deleteAction.bind(null, i.id)}
                      successMessage="Industry deleted."
                      onSubmit={(e) => {
                        if (!confirm(`Delete the “${i.name}” industry?`)) e.preventDefault();
                      }}
                    >
                      <button type="submit" className="px-1 text-xs text-gs-gray hover:text-gs-red hover:underline">
                        Delete
                      </button>
                    </ActionForm>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
