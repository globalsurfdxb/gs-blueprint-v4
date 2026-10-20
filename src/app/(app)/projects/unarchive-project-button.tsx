"use client";


import { ActionForm } from "@/components/action-form";
export function UnarchiveProjectButton({ action }: { action: (formData: FormData) => void }) {
  return (
    <ActionForm action={action}>
      <button
        type="submit"
        className="btn btn-secondary btn-sm"
      >
        Restore
      </button>
    </ActionForm>
  );
}
