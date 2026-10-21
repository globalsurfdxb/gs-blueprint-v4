"use server";

import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canManageBugImages } from "@/lib/permissions";
import { runAction } from "@/lib/run-action";
import {
  BLOB_NOT_READY_MESSAGE,
  MAX_BUG_IMAGES,
  blobStorageReady,
  prepareBugImages,
  storeBugImages,
} from "@/lib/bug-image-upload";

async function loadBugForImages(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true,
      taskType: true,
      assignedToId: true,
      createdById: true,
      groupId: true,
      _count: { select: { bugImages: true } },
    },
  });
  if (!task) throw new Error("Task not found.");
  const group = task.groupId
    ? await prisma.taskGroup.findUnique({ where: { id: task.groupId }, select: { leadUserId: true, podId: true } })
    : null;
  return { task, group };
}

/**
 * Attach one screenshot to a Bug. Images only (PNG/JPG/WebP), ≤5MB, max 3 per bug — all
 * enforced HERE, server-side, before anything is uploaded, so a request that bypasses the
 * file picker can't get through. The binary goes to Vercel Blob; only a reference is stored.
 */
export async function uploadBugImage(projectId: string, taskId: string, formData: FormData) {
  return runAction(async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");

  const { task, group } = await loadBugForImages(taskId);
  if (task.taskType !== "BUG") throw new Error("Screenshots can only be attached to a Bug.");
  if (!canManageBugImages(user, group, task)) {
    throw new Error("You don't have permission to attach images to this bug.");
  }
  if (task._count.bugImages >= MAX_BUG_IMAGES) {
    throw new Error(`A bug can have at most ${MAX_BUG_IMAGES} images — remove one first.`);
  }

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image to upload.");
  const [prepared] = await prepareBugImages([file], task._count.bugImages);

  // Without a Blob store connected there is nothing to upload to — say so plainly instead of the
  // vendor's "No token found" (QA A-02, E-02).
  if (!blobStorageReady()) throw new Error(BLOB_NOT_READY_MESSAGE);

  await storeBugImages(taskId, user.id, [prepared]);

  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  });
}

/** Remove a screenshot — deletes both the DB reference and the blob. No versioning/history. */
export async function removeBugImage(projectId: string, taskId: string, imageId: string, _formData: FormData) {
  return runAction(async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in.");

  const { task, group } = await loadBugForImages(taskId);
  if (!canManageBugImages(user, group, task)) {
    throw new Error("You don't have permission to remove images from this bug.");
  }

  const image = await prisma.bugImage.findUnique({ where: { id: imageId } });
  if (!image || image.taskId !== taskId) throw new Error("Image not found.");

  await prisma.bugImage.delete({ where: { id: imageId } });

  // Handoff copies share the same blob URL across successor tasks — only delete the actual
  // blob once nothing else references it, so removing here can't break a sibling's thumbnail.
  const stillReferenced = await prisma.bugImage.count({ where: { url: image.url } });
  if (stillReferenced === 0) {
    try {
      await del(image.url);
    } catch {
      // best-effort: the DB row (already gone) is the source of truth for what's shown
    }
  }

  revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  });
}
