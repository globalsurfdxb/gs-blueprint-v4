"use client";


import { ActionForm } from "@/components/action-form";
export function DeleteTaskButton({
  taskName,
  action,
}: {
  taskName: string;
  action: (formData: FormData) => void;
}) {
  return (
    <ActionForm
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `Permanently delete "${taskName}"?\n\nOnly possible because it has no time logged, comments, or started work. Any subtasks and attachments are removed too. This cannot be undone.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="btn btn-danger"
      >
        Delete Task
      </button>
    </ActionForm>
  );
}
