"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";

export type LinkItem = {
  id: string;
  url: string;
  label: string | null;
  isEdited: boolean;
  addedBy: { id: string; name: string };
};

/**
 * The "OneDrive Links" block shared by the project page and the task page. Whoever added a link can
 * edit or delete it; an Admin can delete any (QA A-07 — links previously had no delete for anyone
 * but Admin). The inline editor collapses as soon as a save succeeds (QA D-03) instead of staying
 * open under the updated link.
 */
export function LinkList({
  attachments,
  currentUserId,
  canDeleteAny,
  addAction,
  editAction,
  deleteAction,
}: {
  attachments: LinkItem[];
  currentUserId: string;
  /** Admin: may delete links added by anyone. */
  canDeleteAny: boolean;
  addAction: (formData: FormData) => void;
  editAction: (attachmentId: string, formData: FormData) => void;
  deleteAction: (attachmentId: string, formData: FormData) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold uppercase text-gs-gray">OneDrive Links</h2>

      <div className="mt-3 flex flex-col gap-2">
        {attachments.length === 0 && <p className="text-sm text-gs-gray">No links attached yet.</p>}
        {attachments.map((a) => {
          const isAuthor = a.addedBy.id === currentUserId;
          const canDelete = canDeleteAny || isAuthor;
          const isEditing = editingId === a.id;
          return (
            <div key={a.id} className="rounded-md border border-gs-gray/15 bg-white p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={a.url}
                  className="min-w-0 flex-1 truncate font-medium text-gs-red hover:underline"
                >
                  {a.label || a.url}
                </a>
                <span className="shrink-0 text-xs text-gs-gray">
                  {a.addedBy.name}
                  {a.isEdited && " · edited"}
                </span>
              </div>

              {isEditing && isAuthor && (
                <ActionForm
                  action={editAction.bind(null, a.id)}
                  successMessage="Link updated."
                  onSuccess={() => setEditingId(null)}
                  className="mt-3 flex flex-col gap-2"
                >
                  <input
                    name="url"
                    type="url"
                    defaultValue={a.url}
                    required
                    placeholder="https://..."
                    className="field field-sm"
                  />
                  <input
                    name="label"
                    defaultValue={a.label ?? ""}
                    placeholder="Label (optional)"
                    className="field field-sm"
                  />
                  <div className="flex items-center gap-3">
                    <button type="submit" className="btn btn-secondary btn-sm">
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs text-gs-gray hover:underline">
                      Cancel
                    </button>
                  </div>
                </ActionForm>
              )}

              {(isAuthor || canDelete) && !isEditing && (
                <div className="mt-2 flex items-center gap-3 text-xs">
                  {isAuthor && (
                    <button type="button" onClick={() => setEditingId(a.id)} className="text-gs-gray hover:text-gs-black">
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <ActionForm
                      action={deleteAction.bind(null, a.id)}
                      successMessage="Link deleted."
                      onSubmit={(e) => {
                        if (!confirm("Delete this link? This cannot be undone.")) e.preventDefault();
                      }}
                    >
                      <button type="submit" className="text-gs-red hover:underline">
                        Delete
                      </button>
                    </ActionForm>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ActionForm
        action={addAction}
        successMessage="Link added."
        className="mt-4 flex flex-wrap items-end gap-3 rounded-md border border-gs-gray/15 bg-white p-4"
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gs-gray">OneDrive Link</label>
          <input name="url" type="url" required placeholder="https://..." className="field w-64" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gs-gray">Label (optional)</label>
          <input name="label" className="field" />
        </div>
        <button type="submit" className="btn btn-secondary">
          Add Link
        </button>
      </ActionForm>
    </div>
  );
}
