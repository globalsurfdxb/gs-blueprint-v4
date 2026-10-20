"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canManageClients, canCreateClient, isAdmin } from "@/lib/permissions";
import { runAction } from "@/lib/run-action";

async function requireClientManager() {
  const user = await getCurrentUser();
  if (!user || !canManageClients(user)) {
    throw new Error("You don't have permission to manage clients.");
  }
  return user;
}

async function requireClientCreator() {
  const user = await getCurrentUser();
  if (!user || !canCreateClient(user)) {
    throw new Error("Only an Admin or Accountant can create a new client.");
  }
  return user;
}

// The Client form is just a name and an Industry from the Admin-managed list. The other columns
// (contact person/email, account owner) stay in the database untouched — saving never clears them.
const clientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required."),
  industry: z.string().optional(),
});

async function parseClientForm(formData: FormData, existingIndustry?: string | null) {
  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    industry: formData.get("industry") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const { industry } = parsed.data;
  // The industry must be one the Admin offers — or the value the client already has, so editing an
  // older client (whose industry predates the list) still saves.
  if (industry && industry !== existingIndustry) {
    const known = await prisma.industry.findUnique({ where: { name: industry }, select: { id: true } });
    if (!known) throw new Error("Choose an industry from the list.");
  }
  return parsed.data;
}

export async function createClient(formData: FormData) {
  return runAction(async () => {
  const user = await requireClientCreator();
  const data = await parseClientForm(formData);

  const client = await prisma.client.create({
    data: { name: data.name, industry: data.industry },
  });

  revalidatePath("/clients");
  // Accountant can't view the client detail page (intake-only) — send them back to the
  // Dashboard instead of a page that would immediately bounce them.
  redirect(isAdmin(user) ? `/clients/${client.id}` : "/");
  });
}

export async function updateClient(clientId: string, formData: FormData) {
  return runAction(async () => {
  await requireClientManager();
  const existing = await prisma.client.findUnique({ where: { id: clientId }, select: { industry: true } });
  if (!existing) throw new Error("This client no longer exists.");
  const data = await parseClientForm(formData, existing.industry);

  await prisma.client.update({
    where: { id: clientId },
    // `industry: null` clears it when "Not specified" is chosen.
    data: { name: data.name, industry: data.industry ?? null },
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  });
}

/**
 * Permanently deletes a client — Admin only. Refused while the client still has projects
 * (every project requires a client), so delete or reassign those projects first.
 */
export async function deleteClient(
  clientId: string,
  _prevState: { error?: string } | undefined,
  _formData: FormData,
): Promise<{ error?: string }> {
  return runAction(async () => {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return { error: "Only an Admin can delete a client." };

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, _count: { select: { projects: true } } },
  });
  if (!client) return { error: "Client not found." };
  if (client._count.projects > 0) {
    const n = client._count.projects;
    return {
      error: `This client still has ${n} project${n === 1 ? "" : "s"} (including archived ones). Delete those projects first, then delete the client.`,
    };
  }

  await prisma.client.delete({ where: { id: clientId } });

  revalidatePath("/clients");
  redirect("/clients");
  });
}
