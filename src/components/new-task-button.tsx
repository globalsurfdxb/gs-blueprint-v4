"use client";

import { useTaskDrawer } from "@/components/task-drawer";

/**
 * "+ New task" — opens the same create slide-over as a project's Add Task. Without a project it asks
 * which one, listing only the projects the person is attached to; with a projectId it is fixed.
 */
export function NewTaskButton({
  projectId,
  label = "+ New task",
  className = "btn btn-primary btn-sm",
}: {
  projectId?: string;
  label?: string;
  className?: string;
}) {
  const drawer = useTaskDrawer();
  if (!drawer) return null;
  return (
    <button type="button" onClick={() => drawer.openCreate(projectId)} className={className}>
      {label}
    </button>
  );
}
