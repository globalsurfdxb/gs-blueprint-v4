"use client";

export function UnarchiveProjectButton({ action }: { action: (formData: FormData) => void }) {
  return (
    <form action={action}>
      <button
        type="submit"
        className="btn btn-secondary btn-sm"
      >
        Restore
      </button>
    </form>
  );
}
