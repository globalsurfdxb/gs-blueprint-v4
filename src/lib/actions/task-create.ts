"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  canCreateTaskInGroup,
  canSelfCreateInGroup,
  canAssignAnyoneInGroup,
} from "@/lib/permissions";
import { runAction } from "@/lib/run-action";

// Read-side data for the unified create drawer (final build). Everything the create form needs is
// resolved server-side here — the SAME rules the former full-page create flow used — so the client only
// renders already-authorized options and never decides who may create or assign. The write still
// goes through createTaskInDrawer → createTaskCore, which re-checks every rule.
//
// Both fetchers return `{ ok: false, error }` instead of throwing so a problem reaches the browser as
// a readable message in production (QA E-02).

export type CreateAssignee = { id: string; name: string };

export type CreateGroupOption = {
  id: string;
  name: string;
  leadId: string;
  leadName: string;
  bugTrackingEnabled: boolean;
  sprintWorkflowEnabled: boolean;
  canManageSprint: boolean;
  // Assignable pool for this group (already scoped): a Contributor self-creating gets only
  // themselves; a Lead creating into another team's group gets only that group's Lead; otherwise
  // the discipline's pod members plus the Lead. `assigneeLocked` = the pool is a single fixed
  // choice, so the client shows it read-only.
  assignees: CreateAssignee[];
  assigneeLocked: boolean;
  sprints: { id: string; name: string; status: string }[];
};

export type TaskCreateOptions = {
  projectId: string;
  projectName: string;
  clientName: string;
  clusterName: string;
  groups: CreateGroupOption[];
};

// The include shape the creation permission helpers expect.
const projectInclude = {
  client: { select: { name: true } },
  cluster: { select: { name: true } },
  taskGroups: {
    include: {
      lead: true,
      pod: { select: { name: true, bugTrackingEnabled: true, sprintWorkflowEnabled: true } },
    },
  },
} as const;

/**
 * Projects the current user may create a task in — for the drawer's Project picker. Only projects
 * the user is actually attached to appear (QA B-01): Admin sees all; a Lead/Account Manager/Cluster
 * Head sees the projects they lead or oversee; a Contributor sees the projects they have work on.
 */
export async function getCreatableProjects(opts: { bugsOnly?: boolean } = {}) {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Your session has expired. Please sign in again.");

    const projects = await prisma.project.findMany({
      where: { archivedAt: null },
      include: projectInclude,
      orderBy: { name: "asc" },
    });

    // Projects where this user has at least one task assigned — the Contributor's "assigned" set.
    const workedOn = new Set(
      (
        await prisma.task.findMany({
          where: { assignedToId: user.id },
          select: { projectId: true },
          distinct: ["projectId"],
        })
      ).map((t) => t.projectId),
    );

    return projects
      .filter(
        (p) =>
          canCreateTaskInGroup(user, p) ||
          (workedOn.has(p.id) && p.taskGroups.some((g) => canSelfCreateInGroup(user, g))),
      )
      // "Report a bug" only lists projects that have a team with Bug Tracking switched on.
      .filter((p) => !opts.bugsOnly || p.taskGroups.some((g) => g.pod?.bugTrackingEnabled))
      .map((p) => ({ id: p.id, name: p.name, clientName: p.client.name }));
  });
}

/** Per-group create options for one project (eligible groups, assignee pools, sprint field). */
export async function getTaskCreateOptions(projectId: string) {
  return runAction(() => loadTaskCreateOptions(projectId));
}

async function loadTaskCreateOptions(projectId: string): Promise<TaskCreateOptions> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Your session has expired. Please sign in again.");

  const project = await prisma.project.findUnique({ where: { id: projectId }, include: projectInclude });
  if (!project) throw new Error("This project no longer exists.");

  const privileged = canCreateTaskInGroup(user, project);
  const eligibleGroups = privileged
    ? project.taskGroups
    : project.taskGroups.filter((g) => canSelfCreateInGroup(user, g));

  // Whoever can create a task here may place their OWN new task in a Sprint (QA A-03), so the
  // sprint list is loaded whenever a sprint-enabled group is eligible.
  const sprintEnabledGroups = project.taskGroups.filter((g) => g.pod?.sprintWorkflowEnabled);
  const sprints =
    sprintEnabledGroups.length > 0
      ? await prisma.sprint.findMany({
          where: { projectId, status: { not: "COMPLETED" } },
          orderBy: [{ status: "asc" }, { startDate: "asc" }],
          select: { id: true, name: true, status: true },
        })
      : [];

  const groups: CreateGroupOption[] = [];
  for (const g of eligibleGroups) {
    let assignees: CreateAssignee[];
    let assigneeLocked: boolean;

    if (!privileged) {
      // Contributor self-create: always assigned to themselves — the only option.
      assignees = [{ id: user.id, name: user.name }];
      assigneeLocked = true;
    } else if (!canAssignAnyoneInGroup(user, g)) {
      // Cross-team creation: hand off only to that group's own Lead.
      assignees = g.lead.isActive ? [{ id: g.lead.id, name: g.lead.name }] : [];
      assigneeLocked = true;
    } else {
      // Own group / Admin: the discipline's pod members (or cluster, for a legacy pod-less
      // group) plus the group's Lead.
      const members = await prisma.userRole.findMany({
        where: {
          OR: [
            ...(g.podId ? [{ podId: g.podId }] : []),
            ...(!g.podId ? [{ clusterId: g.clusterId ?? project.clusterId }] : []),
          ],
        },
        include: { user: true },
        distinct: ["userId"],
      });
      const byId = new Map(members.map((r) => [r.user.id, r.user]));
      byId.set(g.lead.id, g.lead);
      assignees = Array.from(byId.values())
        .filter((u) => u.isActive)
        .map((u) => ({ id: u.id, name: u.name }));
      assigneeLocked = false;
    }

    const canPlaceInSprint = !!g.pod?.sprintWorkflowEnabled;
    groups.push({
      id: g.id,
      name: g.name,
      leadId: g.lead.id,
      leadName: g.lead.name,
      bugTrackingEnabled: !!g.pod?.bugTrackingEnabled,
      sprintWorkflowEnabled: !!g.pod?.sprintWorkflowEnabled,
      canManageSprint: canPlaceInSprint,
      assignees,
      assigneeLocked,
      sprints: canPlaceInSprint ? sprints : [],
    });
  }

  return {
    projectId: project.id,
    projectName: project.name,
    clientName: project.client.name,
    clusterName: project.cluster.name,
    groups,
  };
}
