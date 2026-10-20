"use client";


import { ActionForm } from "@/components/action-form";
export function ArchiveProjectButton({
  projectName,
  action,
}: {
  projectName: string;
  action: (formData: FormData) => void;
}) {
  return (
    <ActionForm
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `Archive "${projectName}"?\n\nIt will be hidden from all listings, dashboards and reports, but its data is kept and it can be restored later.`,
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
        Archive Project
      </button>
    </ActionForm>
  );
}
