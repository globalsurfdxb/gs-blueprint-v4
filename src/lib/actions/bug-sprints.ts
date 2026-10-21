"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canAssignBugToBugSprint, canManageBugSprints } from "@/lib/permissions";
import { runAction } from "@/lib/run-action";

// Bug sprints: a named batch of a project's bugs with a due date (Frontend, Backend, Regression
// Retesting…). Managed by whoever runs the bug-tracking team on the project (canManageBugSprints);
// a bug can be filed under one by its assignee/reporter too (canAssignBugToBugSprint).

async function loadProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { taskGroups: { include: { pod: { select: { name: true, bugTrackingEnabled: true } } } } },
  });
  if (!project) return null;
  const bugGroups = project.taskGroups.filter((g) => g.pod?.bugTrackingEnabled);
  return { project, bugGroups };
}

const fieldsSchema = z.object({
  name: z.string().trim().min(2, "Give the bug sprint a name (at least 2 characters).").max(80, "Keep the name under 80 characters."),
  dueDate: z.string().min(1, "A due date is required."),
});

function parseFields(formData: FormData) {
  const parsed = fieldsSchema.safeParse({ name: formData.get("name"), dueDate: formData.get("dueDate") });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");
  const due = new Date(parsed.data.dueDate);
  if (Number.isNaN(due.getTime())) throw new Error("Enter a valid due date.");
  return { name: parsed.data.name, dueDate: due };
}

async function assertNameFree(projectId: string, name: string, exceptId?: string) {
  const clash = await prisma.bugSprint.findFirst({
    where: { projectId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new Error(`This project already has a bug sprint called “${name}”.`);
}

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
}

export async function createBugSprint(projectId: string, formData: FormData) {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Your session has expired. Please sign in again.");
    const loaded = await loadProject(projectId);
    if (!loaded) throw new Error("This project no longer exists.");
    if (loaded.bugGroups.length === 0) throw new Error("Bug Tracking isn't enabled for any team on this project.");
    if (!canManageBugSprints(user, loaded.project, loaded.bugGroups)) {
      throw new Error("Only the project's bug-tracking Lead, its Cluster Head or an Admin can create bug sprints.");
    }
    const { name, dueDate } = parseFields(formData);
    await assertNameFree(projectId, name);

    const sprint = await prisma.bugSprint.create({ data: { projectId, name, dueDate, createdById: user.id } });
    refresh(projectId);
    return { ok: true as const, bugSprintId: sprint.id };
  });
}

export async function updateBugSprint(bugSprintId: string, formData: FormData) {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Your session has expired. Please sign in again.");
    const sprint = await prisma.bugSprint.findUnique({ where: { id: bugSprintId } });
    if (!sprint) throw new Error("This bug sprint no longer exists.");
    const loaded = await loadProject(sprint.projectId);
    if (!loaded || !canManageBugSprints(user, loaded.project, loaded.bugGroups)) {
      throw new Error("Only the project's bug-tracking Lead, its Cluster Head or an Admin can edit bug sprints.");
    }
    const { name, dueDate } = parseFields(formData);
    await assertNameFree(sprint.projectId, name, bugSprintId);
    await prisma.bugSprint.update({ where: { id: bugSprintId }, data: { name, dueDate } });
    refresh(sprint.projectId);
    return { ok: true as const };
  });
}

/** Deleting a bug sprint never deletes its bugs — they simply return to "not in a bug sprint". */
export async function deleteBugSprint(bugSprintId: string, _formData: FormData) {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Your session has expired. Please sign in again.");
    const sprint = await prisma.bugSprint.findUnique({
      where: { id: bugSprintId },
      include: { _count: { select: { bugs: true } } },
    });
    if (!sprint) throw new Error("This bug sprint no longer exists.");
    const loaded = await loadProject(sprint.projectId);
    if (!loaded || !canManageBugSprints(user, loaded.project, loaded.bugGroups)) {
      throw new Error("Only the project's bug-tracking Lead, its Cluster Head or an Admin can delete bug sprints.");
    }
    await prisma.bugSprint.delete({ where: { id: bugSprintId } }); // bugs' bug_sprint_id is set to null
    refresh(sprint.projectId);
    const n = sprint._count.bugs;
    return {
      ok: true as const,
      notice: n > 0 ? `${n} ${n === 1 ? "bug is" : "bugs are"} now outside any bug sprint.` : undefined,
    };
  });
}

/** Put existing bugs under a bug sprint (moving them if they are in another one). */
export async function addBugsToBugSprint(bugSprintId: string, formData: FormData) {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Your session has expired. Please sign in again.");
    const sprint = await prisma.bugSprint.findUnique({ where: { id: bugSprintId } });
    if (!sprint) throw new Error("This bug sprint no longer exists.");
    const loaded = await loadProject(sprint.projectId);
    if (!loaded) throw new Error("This sprint's project no longer exists.");

    const taskIds = Array.from(new Set(formData.getAll("taskId").map(String).filter(Boolean)));
    if (taskIds.length === 0) throw new Error("Tick at least one bug to add.");

    const bugs = await prisma.task.findMany({
      where: { id: { in: taskIds }, projectId: sprint.projectId, taskType: "BUG" },
    });
    const allowed = bugs.filter((b) => canAssignBugToBugSprint(user, loaded.project, loaded.bugGroups, b));
    if (allowed.length === 0) {
      throw new Error("None of the selected bugs can be added — you can only move bugs you manage or own.");
    }
    await prisma.task.updateMany({ where: { id: { in: allowed.map((b) => b.id) } }, data: { bugSprintId } });
    refresh(sprint.projectId);

    const skipped = taskIds.length - allowed.length;
    return {
      ok: true as const,
      added: allowed.length,
      notice: skipped > 0 ? `${skipped} ${skipped === 1 ? "bug was" : "bugs were"} skipped (no permission).` : undefined,
    };
  });
}
