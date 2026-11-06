"use client";

import { CopyLinkButton } from "@/components/copy-link-button";

/** "Copy link" for a task: its own page's address, ready to paste into a chat or email. */
export function CopyTaskLink({
  projectId,
  taskId,
  label,
  className,
}: {
  projectId: string;
  taskId: string;
  label?: string;
  className?: string;
}) {
  return <CopyLinkButton path={`/projects/${projectId}/tasks/${taskId}`} noun="task" label={label} className={className} />;
}
