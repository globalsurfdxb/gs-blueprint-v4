"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canAssignTaskToSprint, canCreateTaskInGroup, canManageSprints, canSelfCreateInGroup } from "@/lib/permissions";
import { runAction } from "@/lib/run-action";
import { statusLabel } from "@/lib/bug";

// Data for an expanded sprint on the Sprints page: its tasks, the existing tasks that could be added to it, and
// whether the viewer may create a task in it. Loaded when the row is opened so the page itself stays light. Authority
// is the same as everywhere else (canManageSprints / canAssignTaskToSprint / canCreateTaskInGroup).

export type SprintPanelTask = { id: string; name: string; assigneeName: string | null; status: string; statusLabel: string };
export type SprintPanelCandidate = {
  id: string;
  name: string;
  groupName: string;
  assigneeName: string | null;
  sprintId: string | null;
  sprintName: string | null;
};
export type SprintPanelData = {
  canCreateTask: boolean;
  tasks: SprintPanelTask[];
  candidates: SprintPanelCandidate[];
};

export async function getSprintPanel(sprintId: string) {
  return runAction(async (): Promise<SprintPanelData> => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Your session has expired. Please sign in again.");

    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new Error("This sprint no longer exists.");
    const project = await prisma.project.findUnique({
      where: { id: sprint.projectId },
      include: { taskGroups: { include: { pod: { select: { name: true, sprintWorkflowEnabled: true } } } } },
    });
    if (!project || project.archivedAt) throw new Error("This sprint's project is not available.");

    const sprintGroups = project.taskGroups.filter((g) => g.pod?.sprintWorkflowEnabled);
    const groupIds = sprintGroups.map((g) => g.id);
    const manages = canManageSprints(user, project, sprintGroups);
    const mine = { OR: [{ assignedToId: user.id }, { createdById: user.id }] };

    const [inSprint, others] = await Promise.all([
      prisma.task.findMany({
        where: { sprintId, parentTaskId: null, taskType: "STANDARD", ...(manages ? {} : mine) },
        include: { assignedTo: { select: { name: true } } },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      }),
      sprint.status === "COMPLETED"
        ? Promise.resolve([])
        : prisma.task.findMany({
            where: {
              projectId: project.id,
              groupId: { in: groupIds },
              parentTaskId: null,
              taskType: "STANDARD",
              status: { not: "COMPLETED" },
              OR: [{ sprintId: null }, { sprintId: { not: sprintId } }],
              ...(manages ? {} : mine),
            },
            include: {
              assignedTo: { select: { name: true } },
              group: { select: { name: true } },
              sprint: { select: { name: true, status: true } },
            },
            orderBy: { name: "asc" },
          }),
    ]);

    const canCreateTask =
      sprint.status !== "COMPLETED" &&
      (canCreateTaskInGroup(user, project)
        ? sprintGroups.length > 0
        : sprintGroups.some((g) => canSelfCreateInGroup(user, g)));

    return {
      canCreateTask,
      tasks: inSprint.map((t) => ({
        id: t.id,
        name: t.name,
        assigneeName: t.assignedTo?.name ?? null,
        status: t.status,
        statusLabel: statusLabel(t.status, t.taskType),
      })),
      // Same rule as the task's own Sprint field and the add action: a sprint manager, or the task's assignee/creator.
      candidates: others
        .filter((t) => (t.sprint ? t.sprint.status !== "COMPLETED" : true) && canAssignTaskToSprint(user, project, sprintGroups, t))
        .map((t) => ({
          id: t.id,
          name: t.name,
          groupName: t.group?.name ?? "",
          assigneeName: t.assignedTo?.name ?? null,
          sprintId: t.sprintId,
          sprintName: t.sprint?.name ?? null,
        })),
    };
  });
}
