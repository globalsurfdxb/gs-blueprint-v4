"use client";

import { useState } from "react";
import { formatLocalDate, formatLocalTime } from "@/lib/timezone";
import { ActionForm, SubmitButton } from "@/components/action-form";

type CommentItem = {
  id: string;
  text: string;
  isEdited: boolean;
  createdAt: Date;
  author: { id: string; name: string };
};

/** Comment timestamps are stored UTC and rendered in the VIEWER's local timezone
 * (PRD 9.5) — the same instant shows as different wall-clock times to a Dubai vs an
 * India user, each correct, never the raw server time to both. */
function localStamp(createdAt: Date, location: string) {
  return `${formatLocalDate(createdAt, location)} ${formatLocalTime(createdAt, location)}`;
}

function CommentRow({
  comment,
  viewerLocation,
  canEdit,
  canDelete,
  editAction,
  deleteAction,
}: {
  comment: CommentItem;
  viewerLocation: string;
  canEdit: boolean;
  canDelete: boolean;
  editAction: (commentId: string, formData: FormData) => void;
  deleteAction: (commentId: string, formData: FormData) => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="rounded-md border border-gs-gray/15 bg-white p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">{comment.author.name}</span>
        <span className="text-xs text-gs-gray">
          {localStamp(comment.createdAt, viewerLocation)}
          {comment.isEdited && " · edited"}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap">{comment.text}</p>
      <div className="mt-2 flex gap-3 text-xs">
        {canEdit && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-gs-gray hover:text-gs-black">
            Edit
          </button>
        )}
        {canDelete && (
          <ActionForm action={deleteAction.bind(null, comment.id)} successMessage="Comment deleted.">
            <SubmitButton className="text-gs-red hover:underline" pendingLabel="Deleting…">
              Delete
            </SubmitButton>
          </ActionForm>
        )}
      </div>

      {canEdit && editing && (
        <ActionForm
          action={editAction.bind(null, comment.id)}
          successMessage="Comment saved."
          onSuccess={() => setEditing(false)}
          className="mt-2 flex flex-col gap-2"
        >
          <textarea
            name="text"
            defaultValue={comment.text}
            required
            rows={2}
            className="field field-sm"
          />
          <div className="flex gap-2">
            <SubmitButton
              className="btn btn-secondary btn-sm self-start"
              pendingLabel="Saving…"
            >
              Save
            </SubmitButton>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="self-start rounded-md px-3 py-1 text-xs font-medium text-gs-gray hover:bg-gs-light"
            >
              Cancel
            </button>
          </div>
        </ActionForm>
      )}
    </div>
  );
}

export function CommentsSection({
  comments,
  currentUserId,
  viewerLocation,
  canDelete,
  addAction,
  editAction,
  deleteAction,
}: {
  comments: CommentItem[];
  currentUserId: string;
  viewerLocation: string;
  canDelete: boolean;
  addAction: (formData: FormData) => void;
  editAction: (commentId: string, formData: FormData) => void;
  deleteAction: (commentId: string, formData: FormData) => void;
}) {
  // Bumping the key remounts the add form so its textarea clears after a successful post.
  const [addKey, setAddKey] = useState(0);

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold uppercase text-gs-gray">Comments</h2>

      <div className="mt-3 flex flex-col gap-3">
        {comments.length === 0 && <p className="text-sm text-gs-gray">No comments yet.</p>}
        {comments.map((c) => (
          <CommentRow
            key={c.id}
            comment={c}
            viewerLocation={viewerLocation}
            canEdit={c.author.id === currentUserId}
            canDelete={canDelete}
            editAction={editAction}
            deleteAction={deleteAction}
          />
        ))}
      </div>

      <ActionForm
        key={addKey}
        action={addAction}
        successMessage="Comment posted."
        onSuccess={() => setAddKey((k) => k + 1)}
        className="mt-4 flex flex-col gap-2 rounded-md border border-gs-gray/15 bg-white p-4"
      >
        <textarea
          name="text"
          required
          rows={3}
          placeholder="Add a comment..."
          className="field"
        />
        <SubmitButton
          className="btn btn-primary self-start"
          pendingLabel="Posting…"
        >
          Post Comment
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
