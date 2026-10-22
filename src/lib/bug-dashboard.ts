import "server-only";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth";
import { getBugAccess } from "@/lib/bug-access";
import { bugCountsOf, bugSprintTiming } from "@/lib/bug-sprints";
import { daysOverdue } from "@/lib/timezone";
import { formatDate } from "@/lib/format";
import type { SprintCounts } from "@/lib/sprint-dashboard";

const FALLBACK_LOCATION = "DUBAI";

export type DashBugSprint = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  clientName: string;
  dueLabel: string;
  timingLabel: string;
  timingTone: "ok" | "warn" | "late" | "muted";
  counts: SprintCounts;
};

export type DashOverdueBug = {
  id: string;
  projectId: string;
  name: string;
  projectName: string;
  clientName: string;
  assigneeName: string | null;
  severity: string | null;
  dueLabel: string;
  daysLate: number;
};

export type BugDashboardData = {
  /** The viewer has a Bug-Tracking team in scope — otherwise the dashboard shows no Bugs section at all. */
  hasBugs: boolean;
  counts: SprintCounts;
  open: number;
  inProgress: number;
  readyForRetest: number;
  /** Not-yet-closed bugs that have been reopened at least once. */
  reopened: number;
  criticalHigh: number;
  overdue: number;
  /** Open bugs still sitting with their group Lead, waiting to be assigned to a developer. */
  awaitingTriage: number;
  sprints: DashBugSprint[];
  overdueBugs: DashOverdueBug[];
};

const EMPTY: BugDashboardData = {
  hasBugs: false,
  counts: { notStarted: 0, inProgress: 0, review: 0, completed: 0, total: 0 },
  open: 0,
  inProgress: 0,
  readyForRetest: 0,
  reopened: 0,
  criticalHigh: 0,
  overdue: 0,
  awaitingTriage: 0,
  sprints: [],
  overdueBugs: [],
};

/**
 * Bug roll-up for the dashboards, scoped exactly like the Bugs page (getBugAccess): oversight sees every
 * bug in their groups, anyone else only bugs assigned to or reported by them. Bug sprints are listed the
 * same way — all of them where the viewer oversees the project, otherwise only those holding one of
 * their bugs.
 */
export async function getBugDashboardData(user: CurrentUser): Promise<BugDashboardData> {
  const access = await getBugAccess(user);
  if (access.groupIds.length === 0) return EMPTY;

  const now = new Date();
  const [loaded, groups] = await Promise.all([
    prisma.task.findMany({
      where: { taskType: "BUG", groupId: { in: access.groupIds }, parentTaskId: null, project: { archivedAt: null } },
      include: {
        project: { select: { name: true, client: { select: { name: true } } } },
        assignedTo: { select: { name: true, location: true } },
        group: { select: { leadUserId: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.taskGroup.findMany({ where: { id: { in: access.groupIds } }, select: { id: true, projectId: true } }),
  ]);

  const bugs = loaded.filter(
    (b) =>
      (b.groupId !== null && access.fullViewGroupIds.has(b.groupId)) ||
      b.assignedToId === user.id ||
      b.createdById === user.id,
  );
  const stillOpen = bugs.filter((b) => b.status !== "COMPLETED");

  const counts = bugCountsOf(bugs);
  const overdueBugs: DashOverdueBug[] = [];
  for (const b of stillOpen) {
    if (b.status === "ON_HOLD") continue;
    const late = daysOverdue(b.dueDate, b.assignedTo?.location ?? FALLBACK_LOCATION, now);
    if (late !== null && late > 0) {
      overdueBugs.push({
        id: b.id,
        projectId: b.projectId,
        name: b.name,
        projectName: b.project.name,
        clientName: b.project.client.name,
        assigneeName: b.assignedTo?.name ?? null,
        severity: b.severity,
        dueLabel: formatDate(b.dueDate),
        daysLate: late,
      });
    }
  }
  overdueBugs.sort((a, b) => b.daysLate - a.daysLate);

  // Bug sprints on the projects this person has bug access to.
  const projectIds = Array.from(new Set(groups.map((g) => g.projectId)));
  const fullViewProjectIds = new Set(groups.filter((g) => access.fullViewGroupIds.has(g.id)).map((g) => g.projectId));
  const rawSprints = await prisma.bugSprint.findMany({
    where: { projectId: { in: projectIds }, project: { archivedAt: null } },
    include: { project: { select: { name: true, client: { select: { name: true } } } } },
  });
  const sprints: (DashBugSprint & { dueMs: number; finished: boolean })[] = rawSprints
    .filter((sp) => fullViewProjectIds.has(sp.projectId) || bugs.some((b) => b.bugSprintId === sp.id))
    .map((sp) => {
      const c = bugCountsOf(bugs.filter((b) => b.bugSprintId === sp.id));
      const timing = bugSprintTiming(sp.dueDate, c, now);
      return {
        id: sp.id,
        name: sp.name,
        projectId: sp.projectId,
        projectName: sp.project.name,
        clientName: sp.project.client.name,
        dueLabel: formatDate(sp.dueDate),
        timingLabel: timing.label,
        timingTone: timing.tone,
        counts: c,
        dueMs: sp.dueDate.getTime(),
        finished: c.total > 0 && c.completed === c.total,
      };
    })
    // Soonest due first; a bug sprint whose bugs are all closed drops to the bottom.
    .sort((a, b) => Number(a.finished) - Number(b.finished) || a.dueMs - b.dueMs);

  return {
    hasBugs: true,
    counts,
    open: counts.notStarted,
    inProgress: counts.inProgress,
    readyForRetest: counts.review,
    reopened: stillOpen.filter((b) => b.revisionCount > 0).length,
    criticalHigh: stillOpen.filter((b) => b.severity === "CRITICAL" || b.severity === "HIGH").length,
    overdue: overdueBugs.length,
    awaitingTriage: stillOpen.filter((b) => b.status === "NEW" && b.assignedToId === b.group?.leadUserId).length,
    sprints: sprints.map(({ dueMs: _d, finished: _f, ...row }) => row),
    overdueBugs: overdueBugs.slice(0, 10),
  };
}
