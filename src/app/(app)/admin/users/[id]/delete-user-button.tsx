"use client";

import { useActionState } from "react";

export function DeleteUserButton({
  userName,
  action,
}: {
  userName: string;
  action: (prevState: { error?: string } | undefined, formData: FormData) => Promise<{ error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`Permanently delete ${userName}? This cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="btn btn-danger"
      >
        {pending ? "Deleting…" : "Delete User"}
      </button>
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-gs-red">
          {state.error}
        </p>
      )}
    </form>
  );
}
