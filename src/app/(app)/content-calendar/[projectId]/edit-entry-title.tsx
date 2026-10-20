"use client";

import Link from "next/link";
import { useState } from "react";

export function EditEntryTitle({
  title,
  taskHref,
  editable,
  action,
}: {
  title: string;
  taskHref: string;
  editable: boolean;
  action: (formData: FormData) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Link href={taskHref} className="font-medium hover:underline">
          {title}
        </Link>
        {editable && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-gs-red hover:underline"
          >
            Edit
          </button>
        )}
      </span>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        name="title"
        required
        defaultValue={title}
        className="field field-sm min-w-0 flex-1"
      />
      <button
        type="submit"
        className="btn btn-primary"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="btn btn-secondary"
      >
        Cancel
      </button>
    </form>
  );
}
