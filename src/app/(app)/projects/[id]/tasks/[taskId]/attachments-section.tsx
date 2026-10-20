type AttachmentItem = {
  id: string;
  url: string;
  label: string | null;
  isEdited: boolean;
  addedBy: { id: string; name: string };
};

export function AttachmentsSection({
  attachments,
  currentUserId,
  canDelete,
  addAction,
  editAction,
  deleteAction,
}: {
  attachments: AttachmentItem[];
  currentUserId: string;
  canDelete: boolean;
  addAction: (formData: FormData) => void;
  editAction: (attachmentId: string, formData: FormData) => void;
  deleteAction: (attachmentId: string, formData: FormData) => void;
}) {
  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold uppercase text-gs-gray">OneDrive Links</h2>

      <div className="mt-3 flex flex-col gap-2">
        {attachments.length === 0 && <p className="text-sm text-gs-gray">No links attached yet.</p>}
        {attachments.map((a) => {
          const canEdit = a.addedBy.id === currentUserId;
          const editWithId = editAction.bind(null, a.id);
          const deleteWithId = deleteAction.bind(null, a.id);
          return (
            <div key={a.id} className="rounded-md border border-gs-gray/15 bg-white p-4 text-sm">
              <div className="flex items-center justify-between">
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-medium text-gs-red hover:underline">
                  {a.label || a.url}
                </a>
                <span className="text-xs text-gs-gray">
                  {a.addedBy.name}
                  {a.isEdited && " · edited"}
                </span>
              </div>
              <div className="mt-2 flex gap-3 text-xs">
                {canEdit && (
                  <details>
                    <summary className="cursor-pointer text-gs-gray hover:text-gs-black">Edit</summary>
                    <form action={editWithId} className="mt-2 flex flex-col gap-2">
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
                      <button
                        type="submit"
                        className="btn btn-secondary btn-sm self-start"
                      >
                        Save
                      </button>
                    </form>
                  </details>
                )}
                {canDelete && (
                  <form action={deleteWithId}>
                    <button type="submit" className="text-gs-red hover:underline">
                      Delete
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <form action={addAction} className="mt-4 flex flex-wrap items-end gap-3 rounded-md border border-gs-gray/15 bg-white p-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gs-gray">OneDrive Link</label>
          <input
            name="url"
            type="url"
            required
            placeholder="https://..."
            className="field w-64"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gs-gray">Label (optional)</label>
          <input name="label" className="field" />
        </div>
        <button
          type="submit"
          className="btn btn-secondary"
        >
          Add Link
        </button>
      </form>
    </div>
  );
}
