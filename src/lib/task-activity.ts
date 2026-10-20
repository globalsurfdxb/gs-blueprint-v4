import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { TaskStatus } from "@/generated/prisma/client";
import type { CurrentUser } from "@/lib/auth";

// Shared building blocks for the task-status and timer actions: one place for "what counts as
// work having started", timer start/stop, the bug-only status log, and cache invalidation.

/** Bug-scoped status-change log (PRD 8.2.4 §4): one row per transition, BUG tasks only. */
export async function logBugStatusEvent(task: { id: string; taskType: string }, status: TaskStatus, userId: string) {
  if (task.taskType !== "BUG") return;
  await prisma.taskStatusEvent.create({ data: { taskId: task.id, status, changedById: userId } });
}

/** Has anyone actually worked on this task? A time entry (running or finished) is the only
 * evidence the app has — QA F-06: status can't move to In Progress / Review without it. */
export async function hasLoggedTime(taskId: string): Promise<boolean> {
  return (await prisma.timeLog.count({ where: { taskId } })) > 0;
}

/** Close any timer still running on a task, stamping `at` as its end so the duration is accurate. */
export async function stopOpenTimers(taskId: string, at: Date, onlyUserId?: string) {
  const openLogs = await prisma.timeLog.findMany({
    where: { taskId, endTime: null, ...(onlyUserId ? { userId: onlyUserId } : {}) },
  });
  for (const log of openLogs) {
    await prisma.timeLog.update({
      where: { id: log.id },
      data: {
        endTime: at,
        durationSeconds: Math.max(0, Math.round((at.getTime() - log.startTime.getTime()) / 1000)),
      },
    });
  }
}

/**
 * Start a timer for `user` on `task`. One active timer per user (PRD v1.1 decision #6): any timer
 * already running elsewhere is stopped, and the task it was on is returned so the UI can say so
 * (QA D-08) instead of silently stopping it.
 */
export async function startTimerFor(
  user: CurrentUser,
  task: { id: string },
  now = new Date(),
): Promise<{ stopped: { id: string; name: string; projectId: string } | null }> {
  const openLog = await prisma.timeLog.findFirst({
    where: { userId: user.id, endTime: null },
    include: { task: { select: { id: true, name: true, projectId: true } } },
  });
  if (openLog && openLog.taskId === task.id) throw new Error("A timer is already running on this task.");

  if (openLog) {
    await prisma.timeLog.update({
      where: { id: openLog.id },
      data: {
        endTime: now,
        durationSeconds: Math.max(0, Math.round((now.getTime() - openLog.startTime.getTime()) / 1000)),
      },
    });
  }
  await prisma.timeLog.create({ data: { taskId: task.id, userId: user.id, startTime: now } });
  return { stopped: openLog ? openLog.task : null };
}

/**
 * Refresh every screen that shows a task's status. The old code only revalidated the task's own
 * page, so the dashboards, My Tasks and My Reviews kept stale numbers until a hard refresh
 * (QA F-07: "Review status not reflected on the Admin Dashboard").
 */
export function revalidateTaskSurfaces(projectId: string, taskId?: string) {
  revalidatePath("/");
  revalidatePath("/my-tasks");
  revalidatePath("/my-reviews");
  revalidatePath("/reports", "layout");
  revalidatePath(`/projects/${projectId}`);
  if (taskId) revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
}
