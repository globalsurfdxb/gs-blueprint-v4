"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { runAction } from "@/lib/run-action";

// Admin-managed Industry options for the Client form. A client stores the industry NAME, so a
// rename also updates every client using it, and a delete is refused while any client still uses it.

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) throw new Error("Only an Admin can manage industries.");
  return user;
}

const nameSchema = z.object({
  name: z.string().trim().min(1, "Enter an industry name.").max(80, "Keep the name under 80 characters."),
});

function parseName(formData: FormData) {
  const parsed = nameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");
  return parsed.data.name;
}

/** Case-insensitive duplicate check, ignoring one id (so a rename to the same name with different
 * casing is allowed). */
async function assertNameFree(name: string, exceptId?: string) {
  const clash = await prisma.industry.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new Error(`“${name}” is already in the list.`);
}

function refresh() {
  revalidatePath("/admin/industries");
  revalidatePath("/clients", "layout");
}

export async function createIndustry(formData: FormData) {
  return runAction(async () => {
    await requireAdmin();
    const name = parseName(formData);
    await assertNameFree(name);
    await prisma.industry.create({ data: { name } });
    refresh();
    return { ok: true as const };
  });
}

export async function renameIndustry(industryId: string, formData: FormData) {
  return runAction(async () => {
    await requireAdmin();
    const name = parseName(formData);
    const industry = await prisma.industry.findUnique({ where: { id: industryId } });
    if (!industry) throw new Error("This industry no longer exists.");
    if (industry.name === name) return { ok: true as const };
    await assertNameFree(name, industryId);

    // Keep every client that used the old name in step with the rename.
    await prisma.$transaction([
      prisma.industry.update({ where: { id: industryId }, data: { name } }),
      prisma.client.updateMany({ where: { industry: industry.name }, data: { industry: name } }),
    ]);
    refresh();
    return { ok: true as const };
  });
}

export async function deleteIndustry(industryId: string, _formData: FormData) {
  return runAction(async () => {
    await requireAdmin();
    const industry = await prisma.industry.findUnique({ where: { id: industryId } });
    if (!industry) throw new Error("This industry no longer exists.");

    const inUse = await prisma.client.count({ where: { industry: industry.name } });
    if (inUse > 0) {
      throw new Error(
        `${inUse} client${inUse === 1 ? " uses" : "s use"} “${industry.name}”. Change ${inUse === 1 ? "that client" : "those clients"} to another industry first, then delete it.`,
      );
    }
    await prisma.industry.delete({ where: { id: industryId } });
    refresh();
    return { ok: true as const };
  });
}
