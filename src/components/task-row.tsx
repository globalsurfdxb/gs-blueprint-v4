"use client";

import { useRouter } from "next/navigation";
import { useTaskDrawer } from "@/components/task-drawer";

/** Anything inside a row that already does something when clicked — the row must not also fire. */
const INTERACTIVE = "a,button,input,select,textarea,label,summary,[role=button]:not(tr)";

/**
 * A task table row that opens the task when you click ANYWHERE on it, not just the title: the quick-edit
 * drawer where one is available, the full task page otherwise. Pointer cursor, hover highlight and
 * keyboard support (Tab to the row, Enter / Space to open). Real controls inside the row (the title
 * button, links) keep working on their own.
 */
export function TaskRow({
  taskId,
  projectId,
  className = "",
  children,
}: {
  taskId: string;
  projectId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const drawer = useTaskDrawer();
  const router = useRouter();
  const open = () => (drawer ? drawer.openTask(taskId) : router.push(`/projects/${projectId}/tasks/${taskId}`));

  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
        open();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return; // keys typed inside the row's own controls stay theirs
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className={`cursor-pointer transition-colors hover:bg-gs-red/[0.04] focus-visible:bg-gs-red/[0.06] ${className}`}
    >
      {children}
    </tr>
  );
}
