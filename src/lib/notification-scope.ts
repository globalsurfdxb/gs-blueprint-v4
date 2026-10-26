import type { Prisma } from "@/generated/prisma/client";

/** An overdue / due-tomorrow reminder for a task that has since been completed: no longer true, so it is
 * never listed or counted. */
export const RESOLVED_REMINDER: Prisma.NotificationWhereInput = {
  type: { in: ["OVERDUE", "DUE_TOMORROW"] },
  relatedTask: { status: "COMPLETED" },
};

/** A notification about a task that is assigned to SOMEONE ELSE (a team update, as opposed to my own work).
 * Notifications with no task, or about an unassigned task, count as mine. */
export const teamUpdate = (userId: string): Prisma.NotificationWhereInput => ({
  relatedTask: { assignedToId: { not: userId } },
});
