"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canReassignTask } from "@/lib/permissions";
import { getGroupAssigneePool } from "@/lib/task-assignment";
import { notifyUsers } from "@/lib/notifications";
import { runAction } from "@/lib/run-action";

/**
 * Assign several bugs to one team member in a single step (a Lead triaging a batch). Each bug is checked
 * exactly like a single reassignment — the caller must be that bug's group Lead (or Admin), the bug must
 * not be closed — and the person must be on that bug's team. Bugs that fail a check are skipped and
 * counted; the rest go through.
 */
export async function assignBugsInBulk(projectId: string, formData: FormData) {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Your session has expired. Please sign in again.");

    const taskIds = Array.from(new Set(formData.getAll("taskId").map(String).filter(Boolean)));
    const assigneeId = String(formData.get("assignedToId") ?? "");
    if (taskIds.length === 0) throw new Error("Tick at least one bug to assign.");
    if (!assigneeId) throw new Error("Choose who to assign them to.");

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, clusterId: true } });
    if (!project) throw new Error("This project no longer exists.");

    const bugs = await prisma.task.findMany({
      where: { id: { in: taskIds }, projectId, taskType: "BUG", parentTaskId: null },
      include: {
        group: { select: { id: true, leadUserId: true, podId: true, clusterId: true, pod: { select: { bugTrackingEnabled: true } } } },
      },
    });

    const pools = new Map<string, Set<string>>();
    const movable: typeof bugs = [];
    for (const bug of bugs) {
      const g = bug.group;
      if (!g || !g.pod?.bugTrackingEnabled) continue;
      if (!canReassignTask(user, { leadUserId: g.leadUserId, podId: g.podId }, bug)) continue;
      if (bug.assignedToId === assigneeId) continue;
      let pool = pools.get(g.id);
      if (!pool) {
        pool = new Set((await getGroupAssigneePool(g, project.clusterId)).map((u) => u.id));
        pools.set(g.id, pool);
      }
      if (!pool.has(assigneeId)) continue;
      movable.push(bug);
    }
    if (movable.length === 0) {
      throw new Error(
        "None of the selected bugs could be assigned — you need to lead their team, they must be open, and the person must be on that team.",
      );
    }

    await prisma.task.updateMany({ where: { id: { in: movable.map((b) => b.id) } }, data: { assignedToId: assigneeId } });
    if (assigneeId !== user.id) {
      await notifyUsers([assigneeId], {
        type: "TASK_ASSIGNED",
        message:
          movable.length === 1
            ? `You were assigned "${movable[0].name}".`
            : `You were assigned ${movable.length} bugs.`,
        relatedTaskId: movable[0].id,
        relatedProjectId: projectId,
      });
    }
    revalidatePath(`/projects/${projectId}`);

    const skipped = taskIds.length - movable.length;
    return {
      ok: true as const,
      assigned: movable.length,
      notice: skipped > 0 ? `${skipped} ${skipped === 1 ? "bug was" : "bugs were"} skipped (already theirs, closed, or not yours to assign).` : undefined,
    };
  });
}
