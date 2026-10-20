"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canManageSprintWorkflow } from "@/lib/permissions";
import { runAction } from "@/lib/run-action";

const schema = z.object({
  podId: z.string().min(1),
  enabled: z.enum(["true", "false"]),
});

/** Toggle Sprint Workflow for one discipline (pod) — Admin only (PRD 8.14). */
export async function setPodSprintWorkflow(formData: FormData) {
  return runAction(async () => {
  const user = await getCurrentUser();
  if (!user || !canManageSprintWorkflow(user)) {
    throw new Error("Only an Admin can manage Sprint Workflow settings.");
  }

  const parsed = schema.safeParse({
    podId: formData.get("podId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) throw new Error("Invalid input.");

  await prisma.pod.update({
    where: { id: parsed.data.podId },
    data: { sprintWorkflowEnabled: parsed.data.enabled === "true" },
  });

  revalidatePath("/admin/sprint-workflow");
  });
}
