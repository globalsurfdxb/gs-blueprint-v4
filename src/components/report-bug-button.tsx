"use client";

import { useTaskDrawer } from "@/components/task-drawer";

/**
 * "Report bug" — opens the same slide-over as Add Task, but in bug mode (Bug preselected, only teams
 * with Bug Tracking offered). With a projectId the project is fixed; without one the drawer asks
 * which project, listing only the ones the person can file bugs in.
 */
export function ReportBugButton({
  projectId,
  label = "+ Report bug",
  className = "btn btn-primary btn-sm",
}: {
  projectId?: string;
  label?: string;
  className?: string;
}) {
  const drawer = useTaskDrawer();
  if (!drawer) return null;
  return (
    <button type="button" onClick={() => drawer.openCreate(projectId, undefined, { bug: true })} className={className}>
      {label}
    </button>
  );
}
