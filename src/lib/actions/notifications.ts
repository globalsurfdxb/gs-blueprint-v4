"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { runAction } from "@/lib/run-action";
import { teamUpdate } from "@/lib/notification-scope";

export async function markNotificationRead(notificationId: string, _formData: FormData) {
  return runAction(async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");

  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== user.id) {
    throw new Error("Notification not found.");
  }

  await prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
  revalidatePath("/notifications");
  });
}

/** Marks the unread notifications of one tab as read: "mine" (my own work) or "team" (updates about
 * teammates' tasks). */
export async function markAllNotificationsRead(scope: "mine" | "team", _formData: FormData) {
  return runAction(async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");

  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      isRead: false,
      ...(scope === "team" ? teamUpdate(user.id) : { NOT: teamUpdate(user.id) }),
    },
    data: { isRead: true },
  });
  revalidatePath("/notifications");
  });
}
