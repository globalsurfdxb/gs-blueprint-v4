import { LinkList, type LinkItem } from "@/components/link-list";

export function AttachmentsSection({
  attachments,
  currentUserId,
  canDelete,
  addAction,
  editAction,
  deleteAction,
}: {
  attachments: LinkItem[];
  currentUserId: string;
  /** Admin: may delete any link (the link's author can always delete their own). */
  canDelete: boolean;
  addAction: (formData: FormData) => void;
  editAction: (attachmentId: string, formData: FormData) => void;
  deleteAction: (attachmentId: string, formData: FormData) => void;
}) {
  return (
    <LinkList
      attachments={attachments}
      currentUserId={currentUserId}
      canDeleteAny={canDelete}
      addAction={addAction}
      editAction={editAction}
      deleteAction={deleteAction}
    />
  );
}
