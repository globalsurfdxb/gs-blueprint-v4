"use client";

import { createContext, useContext, useState } from "react";

// Shares the selected Task Type across the create form so the Assigned To field can react to
// it (a Bug auto-routes to the Lead, so the picker is replaced by a read-only note) without
// the Task Type selector and the assignee field being one component.
const TaskTypeContext = createContext<{ taskType: string; setTaskType: (v: string) => void }>({
  taskType: "STANDARD",
  setTaskType: () => {},
});

export function useTaskType() {
  return useContext(TaskTypeContext);
}

export function TaskTypeProvider({
  children,
  initialType = "STANDARD",
}: {
  children: React.ReactNode;
  /** "BUG" when the form was opened from "Report a bug", so Bug is already selected. */
  initialType?: "STANDARD" | "BUG";
}) {
  const [taskType, setTaskType] = useState<string>(initialType);
  return <TaskTypeContext.Provider value={{ taskType, setTaskType }}>{children}</TaskTypeContext.Provider>;
}
