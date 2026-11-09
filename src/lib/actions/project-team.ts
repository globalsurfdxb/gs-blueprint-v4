"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import {
  canManageProjectTeam,
  canViewAllProjectGroups,
  clusterHeadReachesProject,
  isAdmin,
} from "@/lib/permissions";
import { getGroupAssigneePool } from "@/lib/task-assignment";
import { notifyUsers } from "@/lib/notifications";
import { runAction } from "@/lib/run-action";

// Project team: who a Lead / Cluster Head / Admin may add to a project. A Lead picks from the people on the
// teams they lead; oversight roles (Admin, Cluster Head, Account Manager) also from the project's whole cluster, and
// an Admin from anyone active. Every write re-checks authority AND that each person is in the caller's pool.

export type TeamCandidate = { id: string; name: string; detail: string };
export type ProjectTeamData = { members: string[]; candidates: TeamCandidate[] };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  CLUSTER_HEAD: "Cluster Head",
  LEAD: "Lead",
  ACCOUNT_CLIENT_SERVICES: "Account/Client Services",
  CONTRIBUTOR: "Contributor",
  ACCOUNTANT: "Accountant",
};

async function loadProject(user: CurrentUser, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      taskGroups: { select: { id: true, leadUserId: true, podId: true, clusterId: true, pod: { select: { name: true } } } },
    },
  });
  if (!project || project.archivedAt) throw new Error("Project not found.");
  if (!canManageProjectTeam(user, project)) throw new Error("You don't have permission to manage this project's team.");
  return project;
}

/** Ids this caller may add or remove on the project. */
async function poolFor(user: CurrentUser, project: Awaited<ReturnType<typeof loadProject>>): Promise<Set<string>> {
  const ids = new Set<string>();

  if (isAdmin(user)) {
    const everyone = await prisma.user.findMany({ where: { isActive: true, roles: { some: {} } }, select: { id: true } });
    for (const u of everyone) ids.add(u.id);
  } else {
    const oversees = canViewAllProjectGroups(user, project) || clusterHeadReachesProject(user, project);
    const groups = oversees ? project.taskGroups : project.taskGroups.filter((g) => g.leadUserId === user.id);
    for (const pool of await Promise.all(groups.map((g) => getGroupAssigneePool(g, project.clusterId)))) {
      for (const p of pool) ids.add(p.id);
    }
    if (oversees) {
      const cluster = await prisma.userRole.findMany({
        where: { clusterId: project.clusterId, user: { isActive: true } },
        select: { userId: true },
      });
      for (const r of cluster) ids.add(r.userId);
    }
  }
  ids.delete(user.id); // you already have this project; the team list is for everyone else
  return ids;
}

export async function getProjectTeam(projectId: string) {
  return runAction(async (): Promise<ProjectTeamData> => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Your session has expired. Please sign in again.");
    const project = await loadProject(user, projectId);
    const pool = await poolFor(user, project);

    const [members, people] = await Promise.all([
      prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } }),
      prisma.user.findMany({
        where: { id: { in: Array.from(pool) }, isActive: true },
        include: { roles: { include: { cluster: true, pod: true } } },
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      members: members.map((m) => m.userId),
      candidates: people.map((u) => ({
        id: u.id,
        name: u.name,
        detail: Array.from(
          new Set(u.roles.map((r) => [ROLE_LABELS[r.role], r.pod?.name ?? r.cluster?.name].filter(Boolean).join(" · "))),
        ).join(", "),
      })),
    };
  });
}

/** Replace the team with `userIds`, within the caller's pool: people outside it (added by someone with wider reach) stay. */
export async function setProjectTeam(projectId: string, userIds: string[]) {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("Your session has expired. Please sign in again.");
    const project = await loadProject(user, projectId);
    const pool = await poolFor(user, project);

    const wanted = new Set(userIds.filter((id) => pool.has(id)));
    if (userIds.some((id) => !pool.has(id))) throw new Error("One of the selected people can't be added to this project.");

    const current = await prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } });
    const currentIds = new Set(current.map((m) => m.userId));
    const toAdd = Array.from(wanted).filter((id) => !currentIds.has(id));
    const toRemove = Array.from(currentIds).filter((id) => pool.has(id) && !wanted.has(id));

    await prisma.$transaction([
      ...(toRemove.length ? [prisma.projectMember.deleteMany({ where: { projectId, userId: { in: toRemove } } })] : []),
      ...(toAdd.length
        ? [prisma.projectMember.createMany({ data: toAdd.map((userId) => ({ projectId, userId, addedById: user.id })) })]
        : []),
    ]);

    await notifyUsers(toAdd, {
      type: "PROJECT_ASSIGNED",
      message: `${user.name} added you to the team on "${project.name}".`,
      relatedProjectId: projectId,
    });

    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return {
      ok: true as const,
      notice:
        toAdd.length || toRemove.length
          ? `Team updated: ${toAdd.length} added, ${toRemove.length} removed.`
          : "No changes to the team.",
    };
  });
}
