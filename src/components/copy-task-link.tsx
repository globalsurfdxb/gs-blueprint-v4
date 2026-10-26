"use client";

import { useToast } from "@/components/toast";

/**
 * "Copy link": copies the full address of a task (its own page) to the clipboard so it can be pasted into a
 * chat or email. Falls back to a hidden-textarea copy where the clipboard API isn't available.
 */
export function CopyTaskLink({
  projectId,
  taskId,
  label = "Copy link",
  className = "btn btn-secondary btn-sm",
}: {
  projectId: string;
  taskId: string;
  label?: string;
  className?: string;
}) {
  const { addToast } = useToast();

  async function copy() {
    const url = `${window.location.origin}/projects/${projectId}/tasks/${taskId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      if (!ok) {
        addToast("Couldn't copy the link — copy it from the address bar instead.", "error");
        return;
      }
    }
    addToast("Task link copied.", "success");
  }

  return (
    <button type="button" onClick={copy} className={className} title="Copy a link to this task">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mr-1.5 inline-block h-4 w-4 align-[-2px]">
        <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5L9.8 5.2" />
        <path d="M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1.2-1.2" />
      </svg>
      {label}
    </button>
  );
}
