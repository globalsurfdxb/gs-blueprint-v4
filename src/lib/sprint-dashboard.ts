import "server-only";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth";
import { isAdmin, isClusterHeadOf, getClusterHeadPodRestriction, canManageSprints } from "@/lib/permissions";
import { isBottleneck } from "@/lib/dashboard";
import { daysOverdue } from "@/lib/timezone";
import { secondsSince } from "@/lib/format";

// Sprint Progress Dashboard (PRD 8.14) — extends the 8.8 dashboards, scoped to Sprint-enabled
// Task Groups only. A Development Lead sees their own pod; a Cluster Head / Admin see per their
// existing scope (5.2). Reuses the exact 8.8 bottleneck rule (isBottleneck) and the per-user
// overdue rule (daysOverdue) — no new detection logic, no new report.

export type SprintProgressRow = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED";
  totalTasks: number;
  completedTasks: number;
  completionPct: number;
  overdue: number;
  stuck: number;
};

export type SprintWorkloadRow = {
  userId: string;
  name: string;
  openTasks: number;
  loggedSeconds: number;
};

export type SprintProgressData = {
  inScope: boolean; // viewer has at least one Sprint-enabled group in scope
  sprints: SprintProgressRow[]; // Active + Planned sprints in scope
  workload: SprintWorkloadRow[]; // per-person, across ACTIVE-sprint tasks in scope
};

/** Which of the candidate task groups fall in this viewer's oversight scope (Admin, the cluster's
 * Cluster Head, or the Lead who owns the group). Shared by Sprints and Bugs. */
export function groupInScope(
  user: CurrentUser,
  g: { leadUserId: string; clusterId: string | null; podId: string | null; project: { clusterId: string } },
): boolean {
  if (isAdmin(user)) return true;
  // Cluster Head of the group's cluster (its snapshotted cluster, falling back to the
  // project's), honouring a pod-restricted Cluster Head's pod scope.
  const clusterId = g.clusterId ?? g.project.clusterId;
  if (isClusterHeadOf(user, clusterId)) {
    const restriction = getClusterHeadPodRestriction(user, clusterId);
    if (restriction === null) return true;
    if (g.podId !== null && restriction.includes(g.podId)) return true;
  }
  // The Lead who owns the group.
  return g.leadUserId === user.id;
}

export async function getSprintProgressData(user: CurrentUser): Promise<SprintProgressData> {
  const now = new Date();

  // Candidate Sprint-enabled groups on active (non-archived, non-completed) projects.
  const candidateGroups = await prisma.taskGroup.findMany({
    where: {
      pod: { sprintWorkflowEnabled: true },
      project: { archivedAt: null, status: { not: "COMPLETED" } },
    },
    select: {
      id: true,
      leadUserId: true,
      clusterId: true,
      podId: true,
      project: { select: { id: true, clusterId: true } },
    },
  });

  const scopedGroupIds = candidateGroups.filter((g) => groupInScope(user, g)).map((g) => g.id);
  if (scopedGroupIds.length === 0) {
    return { inScope: false, sprints: [], workload: [] };
  }

  // Top-level tasks in those groups (subtasks are personal breakdowns, not sprint items).
  const tasks = await prisma.task.findMany({
    where: { groupId: { in: scopedGroupIds }, parentTaskId: null, sprintId: { not: null } },
    select: {
      id: true,
      status: true,
      dueDate: true,
      updatedAt: true,
      assignedToId: true,
      assignedTo: { select: { name: true, location: true } },
      sprint: { select: { id: true, name: true, status: true, projectId: true, project: { select: { name: true } } } },
    },
  });

  // Per-sprint rollup (Active + Planned only — Completed sprints are historical record).
  const bySprintId = new Map<string, SprintProgressRow>();
  for (const t of tasks) {
    const s = t.sprint;
    if (!s || s.status === "COMPLETED") continue;
    let row = bySprintId.get(s.id);
    if (!row) {
      row = {
        id: s.id,
        name: s.name,
        projectId: s.projectId,
        projectName: s.project.name,
        status: s.status,
        totalTasks: 0,
        completedTasks: 0,
        completionPct: 0,
        overdue: 0,
        stuck: 0,
      };
      bySprintId.set(s.id, row);
    }
    row.totalTasks += 1;
    if (t.status === "COMPLETED") row.completedTasks += 1;
    // Overdue / stuck reuse 8.8's exact rules; On Hold is a deliberate pause, excluded from both.
    if (t.status !== "COMPLETED" && t.status !== "ON_HOLD") {
      const late = daysOverdue(t.dueDate, t.assignedTo?.location, now);
      if (late !== null && late > 0) row.overdue += 1;
    }
    if (isBottleneck(t.status, t.updatedAt, now)) row.stuck += 1;
  }
  for (const row of bySprintId.values()) {
    row.completionPct = row.totalTasks > 0 ? Math.round((row.completedTasks / row.totalTasks) * 100) : 0;
  }

  // Workload per person — across tasks in ACTIVE sprints only (the work in flight).
  const activeSprintTaskIds = tasks.filter((t) => t.sprint?.status === "ACTIVE").map((t) => t.id);
  const workloadByUser = new Map<string, SprintWorkloadRow>();
  for (const t of tasks) {
    if (t.sprint?.status !== "ACTIVE" || t.status === "COMPLETED" || !t.assignedToId) continue;
    const row = workloadByUser.get(t.assignedToId) ?? {
      userId: t.assignedToId,
      name: t.assignedTo?.name ?? "Unknown",
      openTasks: 0,
      loggedSeconds: 0,
    };
    row.openTasks += 1;
    workloadByUser.set(t.assignedToId, row);
  }

  if (activeSprintTaskIds.length > 0) {
    const logs = await prisma.timeLog.findMany({
      where: { taskId: { in: activeSprintTaskIds } },
      select: { userId: true, durationSeconds: true, startTime: true, user: { select: { name: true } } },
    });
    for (const l of logs) {
      const seconds = l.durationSeconds ?? secondsSince(l.startTime);
      const row = workloadByUser.get(l.userId) ?? {
        userId: l.userId,
        name: l.user.name,
        openTasks: 0,
        loggedSeconds: 0,
      };
      row.loggedSeconds += seconds;
      workloadByUser.set(l.userId, row);
    }
  }

  const sprints = Array.from(bySprintId.values()).sort(
    (a, b) =>
      // Active first, then Planned; within a status, by project then sprint name.
      (a.status === b.status ? 0 : a.status === "ACTIVE" ? -1 : 1) ||
      a.projectName.localeCompare(b.projectName) ||
      a.name.localeCompare(b.name),
  );
  const workload = Array.from(workloadByUser.values()).sort((a, b) => a.name.localeCompare(b.name));

  return { inScope: true, sprints, workload };
}

/**
 * Projects whose sprints this person should see in the "Sprints" menu: every Sprint-enabled
 * project in their oversight scope (Admin / Cluster Head / the Lead who owns the group), plus any
 * project where they hold a task in a Sprint-enabled discipline (a Contributor's own sprint work).
 * Empty = the Sprints menu item is hidden.
 */
export async function getSprintProjectIds(user: CurrentUser): Promise<string[]> {
  const [groups, ownTasks] = await Promise.all([
    prisma.taskGroup.findMany({
      where: { pod: { sprintWorkflowEnabled: true }, project: { archivedAt: null } },
      select: {
        leadUserId: true,
        clusterId: true,
        podId: true,
        project: { select: { id: true, clusterId: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        assignedToId: user.id,
        group: { pod: { sprintWorkflowEnabled: true } },
        project: { archivedAt: null },
      },
      select: { projectId: true },
      distinct: ["projectId"],
    }),
  ]);
  const ids = new Set(groups.filter((g) => groupInScope(user, g)).map((g) => g.project.id));
  for (const t of ownTasks) ids.add(t.projectId);
  return Array.from(ids);
}

/** Top-level tasks in a sprint, bucketed for the progress bar. On Hold counts as not started. */
export type SprintCounts = {
  notStarted: number;
  inProgress: number;
  review: number;
  completed: number;
  total: number;
};

const EMPTY_COUNTS: SprintCounts = { notStarted: 0, inProgress: 0, review: 0, completed: 0, total: 0 };

/** Per-sprint task counts by status. Subtasks are personal breakdowns, so they are not counted. With
 * `ownerId`, only that person's own tasks are counted. */
export async function countSprintTasks(sprintIds: string[], ownerId?: string): Promise<Map<string, SprintCounts>> {
  const out = new Map<string, SprintCounts>();
  if (sprintIds.length === 0) return out;
  const rows = await prisma.task.groupBy({
    by: ["sprintId", "status"],
    where: {
      sprintId: { in: sprintIds },
      parentTaskId: null,
      // Only the viewer's own tasks (assigned to or created by them) when `ownerId` is given.
      ...(ownerId ? { OR: [{ assignedToId: ownerId }, { createdById: ownerId }] } : {}),
    },
    _count: { _all: true },
  });
  for (const r of rows) {
    if (!r.sprintId) continue;
    const c = out.get(r.sprintId) ?? { ...EMPTY_COUNTS };
    const n = r._count._all;
    c.total += n;
    if (r.status === "COMPLETED") c.completed += n;
    else if (r.status === "REVIEW") c.review += n;
    else if (r.status === "IN_PROGRESS" || r.status === "REVISION") c.inProgress += n;
    else c.notStarted += n; // NEW, ON_HOLD
    out.set(r.sprintId, c);
  }
  return out;
}

export function sprintCountsFor(map: Map<string, SprintCounts>, id: string): SprintCounts {
  return map.get(id) ?? { ...EMPTY_COUNTS };
}

export type SprintListRow = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  clientName: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED";
  startDate: Date;
  endDate: Date;
  counts: SprintCounts;
  totalTasks: number;
  completedTasks: number;
  completionPct: number;
};

/** Every sprint (any status) on the given projects, with completion counts, Active first. A viewer who
 * doesn't oversee a project (e.g. a Contributor) only gets that project's sprints that hold a task of
 * their own, counted from their own tasks — never other people's sprints or work. */
export async function getSprintList(projectIds: string[], user: CurrentUser): Promise<SprintListRow[]> {
  if (projectIds.length === 0) return [];
  const [allSprints, groups] = await Promise.all([
    prisma.sprint.findMany({
      where: { projectId: { in: projectIds } },
      include: { project: { select: { name: true, client: { select: { name: true } } } } },
    }),
    prisma.taskGroup.findMany({
      where: { projectId: { in: projectIds }, pod: { sprintWorkflowEnabled: true } },
      select: { leadUserId: true, clusterId: true, podId: true, project: { select: { id: true, clusterId: true } } },
    }),
  ]);
  const overseen = new Set(
    user.restrictToOwnTasks ? [] : groups.filter((g) => groupInScope(user, g)).map((g) => g.project.id),
  );
  const limitedIds = allSprints.filter((s) => !overseen.has(s.projectId)).map((s) => s.id);
  const ownCounts = await countSprintTasks(limitedIds, user.id);
  const sprints = allSprints.filter((s) => overseen.has(s.projectId) || (ownCounts.get(s.id)?.total ?? 0) > 0);
  const fullCounts = await countSprintTasks(sprints.filter((s) => overseen.has(s.projectId)).map((s) => s.id));
  const counts = new Map([...fullCounts, ...ownCounts]);
  const order = { ACTIVE: 0, PLANNED: 1, COMPLETED: 2 } as const;
  return sprints
    .map((s) => {
      const c = sprintCountsFor(counts, s.id);
      return {
        id: s.id,
        name: s.name,
        projectId: s.projectId,
        projectName: s.project.name,
        clientName: s.project.client.name,
        status: s.status,
        startDate: s.startDate,
        endDate: s.endDate,
        counts: c,
        totalTasks: c.total,
        completedTasks: c.completed,
        completionPct: c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0,
      };
    })
    .sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        a.projectName.localeCompare(b.projectName) ||
        a.startDate.getTime() - b.startDate.getTime(),
    );
}

/**
 * Projects this person can create sprints in from the Sprints page: Sprint-enabled projects they
 * oversee or lead (same rule as the project's own "+ New Sprint": Admin, the project's Cluster Head,
 * or the Lead of a Sprint-enabled group). A Contributor sees sprints but cannot create them.
 */
export async function getManageableSprintProjects(
  user: CurrentUser,
  projectIds: string[],
): Promise<{ id: string; name: string; clientName: string }[]> {
  if (projectIds.length === 0) return [];
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds }, archivedAt: null, status: { not: "COMPLETED" } },
    include: {
      client: { select: { name: true } },
      taskGroups: { include: { pod: { select: { name: true, sprintWorkflowEnabled: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return projects
    .filter((p) => {
      const sprintGroups = p.taskGroups.filter((g) => g.pod?.sprintWorkflowEnabled);
      return sprintGroups.length > 0 && canManageSprints(user, p, sprintGroups);
    })
    .map((p) => ({ id: p.id, name: p.name, clientName: p.client.name }));
}
