import "server-only";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth";
import { canSelfCreateInGroup } from "@/lib/permissions";
import { groupInScope } from "@/lib/sprint-dashboard";

// Who gets the "Bugs" menu and what they see in it. Bug Tracking is switched on per discipline
// (pod.bugTrackingEnabled, Admin → Bug Tracking), so access follows the same people as the rest of
// the app's bug handling:
//   • Admin, a Cluster Head of the group's cluster, and the Lead who owns the group see EVERY bug in
//     that group;
//   • a Contributor on that discipline's team (the developers and QA who file and fix bugs) sees the
//     bugs assigned to them or reported by them — the same rule as task visibility everywhere else;
//   • a user an Admin has restricted to their own tasks only ever sees their own, whatever their role.
// The menu item shows when the person has any bug-tracking group, even before a bug exists.

export type BugAccess = {
  /** Bug-tracking task groups this person can work with (empty = no Bugs menu). */
  groupIds: string[];
  /** The subset where they see every bug rather than only their own. */
  fullViewGroupIds: Set<string>;
};

export async function getBugAccess(user: CurrentUser): Promise<BugAccess> {
  const groups = await prisma.taskGroup.findMany({
    where: { pod: { bugTrackingEnabled: true }, project: { archivedAt: null } },
    select: {
      id: true,
      leadUserId: true,
      clusterId: true,
      podId: true,
      project: { select: { id: true, clusterId: true } },
    },
  });

  const groupIds: string[] = [];
  const fullViewGroupIds = new Set<string>();
  for (const g of groups) {
    const oversees = !user.restrictToOwnTasks && groupInScope(user, g);
    const isMember = canSelfCreateInGroup(user, { clusterId: g.clusterId, podId: g.podId });
    if (oversees) {
      groupIds.push(g.id);
      fullViewGroupIds.add(g.id);
    } else if (isMember) {
      groupIds.push(g.id);
    }
  }
  return { groupIds, fullViewGroupIds };
}
