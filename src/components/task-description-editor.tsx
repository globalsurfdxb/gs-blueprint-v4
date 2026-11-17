"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { LinkifiedText } from "@/components/linkified-text";

/**
 * A task's description with an Edit button: a roomy text box with no length limit. When the viewer can't edit, it is
 * just the text (or nothing, if there isn't one).
 */
export function TaskDescriptionEditor({
  description,
  canEdit,
  action,
  onSaved,
  emptyLabel = "Add a description",
}: {
  description: string | null;
  canEdit: boolean;
  action: (formData: FormData) => void;
  /** Called after a successful save (the drawer uses it to reload its data). */
  onSaved?: () => void;
  emptyLabel?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing && canEdit) {
    return (
      <ActionForm
        action={action}
        successMessage="Description saved."
        onSuccess={() => {
          setEditing(false);
          onSaved?.();
        }}
        className="flex flex-col gap-2"
      >
        <textarea
          name="description"
          defaultValue={description ?? ""}
          rows={8}
          autoFocus
          placeholder="Describe the task — as long as you need. Links are clickable once saved."
          className="field min-h-40 w-full resize-y"
        />
        <div className="flex gap-2">
          <SubmitButton pendingLabel="Saving…" className="btn btn-primary btn-sm">
            Save
          </SubmitButton>
          <button type="button" onClick={() => setEditing(false)} className="btn btn-secondary btn-sm">
            Cancel
          </button>
        </div>
      </ActionForm>
    );
  }

  return (
    <div>
      {description ? (
        <LinkifiedText text={description} className="text-sm leading-relaxed" />
      ) : (
        !canEdit && <p className="text-sm text-gs-gray">No description.</p>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`text-sm font-medium text-gs-red hover:underline ${description ? "mt-2" : ""}`}
        >
          {description ? "Edit description" : emptyLabel}
        </button>
      )}
    </div>
  );
}
