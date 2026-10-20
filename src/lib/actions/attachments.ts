"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canViewTask, isAdmin } from "@/lib/permissions";
import { runAction } from "@/lib/run-action";

const attachmentSchema = z.object({
  url: z.string().url("Enter a valid URL."),
  label: z.string().optional(),
});

export async function addAttachment(projectId: string, taskId: string, formData: FormData) {
  return runAction(async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");

  const [project, task] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: { taskGroups: { select: { id: true, leadUserId: true, podId: true } } },
    }),
    prisma.task.findUnique({ where: { id: taskId } }),
  ]);
  if (!project || !task) throw new Error("Task not found.");

  if (!(await canViewTask(user, project, task))) {
    throw new Error("You don't have access to this task.");
  }

  const parsed = attachmentSchema.safeParse({
    url: formData.get("url"),
    label: formData.get("label") || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");

  await prisma.taskAttachment.create({
    data: { taskId, url: parsed.data.url, label: parsed.data.label, addedById: user.id },
  });

  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  });
}

export async function editAttachment(
  projectId: string,
  taskId: string,
  attachmentId: string,
  formData: FormData,
) {
  return runAction(async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");

  const attachment = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) throw new Error("Attachment not found.");
  if (attachment.addedById !== user.id) throw new Error("Only the person who added this link can edit it.");

  const parsed = attachmentSchema.safeParse({
    url: formData.get("url"),
    label: formData.get("label") || undefined,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");

  await prisma.taskAttachment.update({
    where: { id: attachmentId },
    data: { url: parsed.data.url, label: parsed.data.label, isEdited: true, editedAt: new Date() },
  });

  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  });
}

export async function deleteAttachment(
  projectId: string,
  taskId: string,
  attachmentId: string,
  _formData: FormData,
) {
  return runAction(async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");
  const attachment = await prisma.taskAttachment.findUnique({
    where: { id: attachmentId },
    select: { addedById: true, taskId: true },
  });
  if (!attachment || attachment.taskId !== taskId) throw new Error("This link no longer exists.");
  // The person who added a link can remove it; an Admin can remove any (QA A-07).
  if (!isAdmin(user) && attachment.addedById !== user.id) {
    throw new Error("Only the person who added this link, or an Admin, can delete it.");
  }

  await prisma.taskAttachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  });
}
