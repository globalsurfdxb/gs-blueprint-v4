import "server-only";
import type { CurrentUser } from "@/lib/auth";
import type { Task } from "@/generated/prisma/client";
import { canAdvanceTask, canRecordBugVerdict } from "@/lib/permissions";
import { statusLabel } from "@/lib/bug";

// The status options a particular person may actually pick for a particular task. The old drawer
// offered New / In Progress / Review / Completed to everybody and let the server reject the wrong
// ones — which production then reported as a meaningless "Server Components render" error
// (QA A-01, B-02, E-01). Now the UI is only ever shown moves that can succeed, with a plain-language
// reason when a move is blocked.
//
// Backward moves are intentionally NOT added here (QA C-01 was explicitly kept as-is): the workflow
// is New → In Progress → Review → Completed, plus the Lead's Review → In Progress "send back".

export type StatusOption = {
  value: string;
  label: string;
  disabled?: boolean;
  /** Short plain-language note shown beside a blocked or special option. */
  hint?: string;
};

type GroupForVerdict = {
  leadUserId: string;
  podId?: string | null;
  clusterId?: string | null;
  pod?: { bugTrackingEnabled?: boolean } | null;
} | null;

export function computeStatusOptions(args: {
  user: CurrentUser;
  task: Task;
  group: GroupForVerdict;
  hasLoggedTime: boolean;
}): StatusOption[] {
  const { user, task, group, hasLoggedTime } = args;
  const label = (s: string) => statusLabel(s, task.taskType);
  const isBug = task.taskType === "BUG";
  const isAssignee = user.id === task.assignedToId;
  const canAdvance = canAdvanceTask(user, task);
  const verdictGroup = group ? { ...group, bugTrackingEnabled: group.pod?.bugTrackingEnabled } : null;
  const canVerdict = canRecordBugVerdict(user, verdictGroup, task);

  const options: StatusOption[] = [{ value: task.status, label: label(task.status) }];

  if (task.status === "NEW" && canAdvance) {
    options.push({
      value: "IN_PROGRESS",
      label: label("IN_PROGRESS"),
      hint: isAssignee ? "Starts your timer" : undefined,
    });
  }
  if (task.status === "IN_PROGRESS" && canAdvance) {
    const blocked = isAssignee && !hasLoggedTime;
    options.push({
      value: "REVIEW",
      label: label("REVIEW"),
      disabled: blocked,
      hint: blocked ? "Log some time first (start the timer)" : undefined,
    });
  }
  if (task.status === "REVIEW" && canVerdict) {
    options.push({ value: "COMPLETED", label: label("COMPLETED") });
    options.push({
      value: "IN_PROGRESS",
      label: isBug ? `${label("REVISION")} (back to In Progress)` : "Send back for revision",
    });
  }
  return options;
}

/** Plain-language explanation for why `from → to` isn't available to this user (for toasts). */
export function explainBlockedMove(args: {
  user: CurrentUser;
  task: Task;
  group: GroupForVerdict;
  target: string;
  hasLoggedTime: boolean;
}): string {
  const { user, task, group, target, hasLoggedTime } = args;
  const options = computeStatusOptions({ user, task, group, hasLoggedTime });
  const match = options.find((o) => o.value === target && o.value !== task.status);
  if (match?.disabled) return match.hint ?? "That status change isn't available yet.";

  const isLeadMove = task.status === "REVIEW" && (target === "COMPLETED" || target === "IN_PROGRESS");
  if (isLeadMove) {
    return target === "COMPLETED"
      ? "Only the group Lead (or Admin) can complete a task after review."
      : "Only the group Lead (or Admin) can send a task back for revision.";
  }
  if (task.status === "COMPLETED") return "This task is completed and can't be changed.";
  if (task.status === "ON_HOLD") return "This task is on hold. Ask the group Lead to resume it first.";
  if (target === task.status) return "The task is already in that status.";
  if (!canAdvanceTask(user, task)) return "Only the person this task is assigned to can move it forward.";
  return "Tasks move one step at a time: New → In Progress → Review → Completed.";
}
