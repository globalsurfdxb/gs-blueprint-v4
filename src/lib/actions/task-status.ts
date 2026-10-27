"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canAdvanceTask, canRecordBugVerdict, canToggleHoldTask } from "@/lib/permissions";
import { notifyUsers } from "@/lib/notifications";
import { runAction } from "@/lib/run-action";
import { computeStatusOptions, explainBlockedMove } from "@/lib/task-status-flow";
import {
  hasLoggedTime,
  logBugStatusEvent,
  revalidateTaskSurfaces,
  stopOpenTimers,
} from "@/lib/task-activity";

// Every public action returns { ok: false, error } for an expected problem (see lib/run-action.ts),
// so the plain-language message reaches the browser in production instead of Next.js's generic
// "Server Components render" text (QA A-01 / E-02). The *Core functions below hold the real logic
// and are shared with the Kanban drag / drawer dropdown, so those can never do what the same user
// couldn't do from the task page.

type Done = { ok: true; notice?: string };

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Your session has expired. Please sign in again.");
  return user;
}

async function loadTaskWithGroup(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("This task no longer exists.");
  const project = await prisma.project.findUnique({ where: { id: task.projectId } });
  if (!project) throw new Error("This task's project no longer exists.");
  const group = task.groupId
    ? await prisma.taskGroup.findUnique({
        where: { id: task.groupId },
        include: { pod: { select: { bugTrackingEnabled: true } } },
      })
    : null;
  return { task, project, group };
}

// ---------------------------------------------------------------------------------------------

async function startTaskCore(taskId: string): Promise<Done> {
  const user = await requireUser();
  const { task, project } = await loadTaskWithGroup(taskId);

  if (!canAdvanceTask(user, task)) throw new Error("Only the person this task is assigned to can start it.");
  if (task.status !== "NEW") throw new Error("This task has already been started.");

  // Moving to In Progress only changes the status. The timer is the assignee's own choice: they start it
  // from the task page when they actually begin (it is still required before submitting for review).
  await prisma.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
  await logBugStatusEvent(task, "IN_PROGRESS", user.id);
  revalidateTaskSurfaces(project.id, taskId);
  return { ok: true };
}

async function submitForReviewCore(taskId: string): Promise<Done> {
  const user = await requireUser();
  const { task, project, group } = await loadTaskWithGroup(taskId);

  if (!canAdvanceTask(user, task)) throw new Error("Only the person this task is assigned to can submit it for review.");
  if (task.status !== "IN_PROGRESS") throw new Error("Only a task that is In Progress can be submitted for review.");
  // Progress is tied to real activity (QA F-06): the assignee can't send untouched work to review.
  if (user.id === task.assignedToId && !(await hasLoggedTime(taskId))) {
    throw new Error("Start the timer and log some time on this task before submitting it for review.");
  }

  await prisma.task.update({ where: { id: taskId }, data: { status: "REVIEW" } });
  await logBugStatusEvent(task, "REVIEW", user.id);
  // The work is handed over, so the assignee's clock stops with it.
  if (task.assignedToId) await stopOpenTimers(taskId, new Date(), task.assignedToId);

  if (group) {
    await notifyUsers([group.leadUserId], {
      type: "SUBMITTED_FOR_REVIEW",
      message: `"${task.name}" was submitted for review by ${user.name}.`,
      relatedTaskId: task.id,
      relatedProjectId: project.id,
    });
  }

  revalidateTaskSurfaces(project.id, taskId);
  return { ok: true };
}

async function approveTaskCore(taskId: string): Promise<Done> {
  const user = await requireUser();
  const { task, project, group } = await loadTaskWithGroup(taskId);

  // Bugs (PRD v1.18): a Contributor member of a Bug-Tracking group can close the bug after
  // retesting; the Lead/Admin always can. Standard tasks stay strictly Lead-only.
  const verdictGroup = group ? { ...group, bugTrackingEnabled: group.pod?.bugTrackingEnabled } : null;
  if (!canRecordBugVerdict(user, verdictGroup, task)) {
    throw new Error("Only the group Lead (or Admin) can complete a task after review.");
  }
  if (task.status !== "REVIEW") throw new Error("Only a task that is in Review can be completed.");

  const completedAt = new Date();
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "COMPLETED", completedAt },
  });
  await logBugStatusEvent(task, "COMPLETED", user.id);

  // A Completed task can't keep accruing time — auto-stop any timer still running on it.
  await stopOpenTimers(taskId, completedAt);

  await notifyUsers([task.createdById, group?.leadUserId], {
    type: "COMPLETED",
    message: `"${task.name}" was marked Completed.`,
    relatedTaskId: task.id,
    relatedProjectId: project.id,
  });

  // Content Calendar tasks do NOT auto-forward to Design on this approval — that's the Content
  // group's own Lead signing off on their team's work, not final clearance (see
  // approveCalendarHandoffToDesign).
  revalidateTaskSurfaces(project.id, taskId);
  return { ok: true };
}

async function sendToRevisionCore(taskId: string): Promise<Done> {
  const user = await requireUser();
  const { task, project, group } = await loadTaskWithGroup(taskId);

  // Bugs (PRD v1.18): a Contributor member of a Bug-Tracking group can reopen the bug after a
  // failed retest; the Lead/Admin always can. Standard tasks stay strictly Lead-only.
  const verdictGroup = group ? { ...group, bugTrackingEnabled: group.pod?.bugTrackingEnabled } : null;
  if (!canRecordBugVerdict(user, verdictGroup, task)) {
    throw new Error("Only the group Lead (or Admin) can send a task back for revision.");
  }
  if (task.status !== "REVIEW") throw new Error("Only a task that is in Review can be sent back for revision.");

  // Revision is momentary by design (PRD 8.3): increment the count and land back in
  // In Progress in the same operation, rather than resting in a REVISION status. The assignee
  // can start the timer again to pick the work back up (QA F-06).
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "IN_PROGRESS", revisionCount: { increment: 1 } },
  });
  // For a Bug this is the "Reopened" moment — logged as REVISION even though the task then
  // rests in In Progress (the Reopen Count captures the tally).
  await logBugStatusEvent(task, "REVISION", user.id);

  if (group) {
    await notifyUsers([group.leadUserId], {
      type: "MOVED_TO_REVISION",
      message: `"${task.name}" was sent to revision.`,
      relatedTaskId: task.id,
      relatedProjectId: project.id,
    });
  }

  revalidateTaskSurfaces(project.id, taskId);
  return { ok: true };
}

const HOLDABLE_STATUSES = ["NEW", "IN_PROGRESS", "REVIEW"] as const;

async function putTaskOnHoldCore(taskId: string): Promise<Done> {
  const user = await requireUser();
  const { task, project, group } = await loadTaskWithGroup(taskId);

  if (!canToggleHoldTask(user, group)) throw new Error("Only the group Lead (or Admin) can put a task on hold.");
  if (!HOLDABLE_STATUSES.includes(task.status as (typeof HOLDABLE_STATUSES)[number])) {
    throw new Error("A task can only be put on hold while it is New, In Progress or in Review.");
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "ON_HOLD", onHoldFromStatus: task.status },
  });
  await logBugStatusEvent(task, "ON_HOLD", user.id);

  // On Hold is a deliberate pause — a paused task shouldn't keep the clock running.
  await stopOpenTimers(taskId, new Date());

  revalidateTaskSurfaces(project.id, taskId);
  return { ok: true };
}

async function resumeTaskFromHoldCore(taskId: string): Promise<Done> {
  const user = await requireUser();
  const { task, project, group } = await loadTaskWithGroup(taskId);

  if (!canToggleHoldTask(user, group)) throw new Error("Only the group Lead (or Admin) can resume a task.");
  if (task.status !== "ON_HOLD" || !task.onHoldFromStatus) throw new Error("This task is not on hold.");

  await prisma.task.update({
    where: { id: taskId },
    data: { status: task.onHoldFromStatus, onHoldFromStatus: null },
  });
  await logBugStatusEvent(task, task.onHoldFromStatus, user.id);
  revalidateTaskSurfaces(project.id, taskId);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Public actions

export async function startTask(taskId: string, _formData: FormData) {
  return runAction(() => startTaskCore(taskId));
}

export async function submitForReview(taskId: string, _formData: FormData) {
  return runAction(() => submitForReviewCore(taskId));
}

export async function approveTask(taskId: string, _formData: FormData) {
  return runAction(() => approveTaskCore(taskId));
}

export async function sendToRevision(taskId: string, _formData: FormData) {
  return runAction(() => sendToRevisionCore(taskId));
}

export async function putTaskOnHold(taskId: string, _formData: FormData) {
  return runAction(() => putTaskOnHoldCore(taskId));
}

export async function resumeTaskFromHold(taskId: string, _formData: FormData) {
  return runAction(() => resumeTaskFromHoldCore(taskId));
}

/**
 * Status change from the quick-edit drawer's dropdown and the Kanban drag-and-drop. It is NOT a
 * separate status path — it validates the move against the SAME options the UI offers
 * (computeStatusOptions) and then runs the same core transition, so a drag or dropdown can never
 * do something the same user couldn't do from the task page. A move that isn't allowed comes back
 * as a plain-language `{ ok: false, error }` (QA A-01, A-04, B-02, E-02).
 *
 * `surfacePath` is the board's own route (e.g. /projects/<id> or /my-tasks) so it re-renders.
 */
export async function changeTaskStatusByDrag(taskId: string, targetStatus: string, surfacePath: string) {
  return runAction(async (): Promise<Done> => {
    const user = await requireUser();
    const { task, group } = await loadTaskWithGroup(taskId);
    const timeLogged = await hasLoggedTime(taskId);

    const allowed = computeStatusOptions({ user, task, group, hasLoggedTime: timeLogged }).find(
      (o) => o.value === targetStatus && o.value !== task.status && !o.disabled,
    );
    if (!allowed) {
      throw new Error(explainBlockedMove({ user, task, group, target: targetStatus, hasLoggedTime: timeLogged }));
    }

    let result: Done;
    switch (`${task.status}->${targetStatus}`) {
      case "NEW->IN_PROGRESS":
        result = await startTaskCore(taskId);
        break;
      case "IN_PROGRESS->REVIEW":
        result = await submitForReviewCore(taskId);
        break;
      case "REVIEW->COMPLETED":
        result = await approveTaskCore(taskId);
        break;
      // A card in Review dragged back to In Progress is a send-back / reopen — the same
      // momentary Revision transition (Reopen for a Bug), which lands back in In Progress.
      case "REVIEW->IN_PROGRESS":
        result = await sendToRevisionCore(taskId);
        break;
      default:
        throw new Error("Tasks move one step at a time: New → In Progress → Review → Completed.");
    }

    revalidatePath(surfacePath);
    return result;
  });
}
