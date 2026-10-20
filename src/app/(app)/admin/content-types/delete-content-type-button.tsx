"use client";


import { ActionForm } from "@/components/action-form";
export function DeleteContentTypeButton({
  name,
  action,
}: {
  name: string;
  action: (formData: FormData) => void;
}) {
  return (
    <ActionForm
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Delete the "${name}" Content Type? This cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="px-1 py-2.5 text-xs text-gs-gray hover:text-gs-red hover:underline">
        Delete
      </button>
    </ActionForm>
  );
}
