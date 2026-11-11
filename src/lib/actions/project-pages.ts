"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canManageProjectPages } from "@/lib/permissions";
import { runAction } from "@/lib/run-action";

// A project's site pages (name + URL). Managed by the project's Lead / Cluster Head / Account Manager / Admin; anyone
// reporting a bug can also add a page on the spot (that path lives in createTaskCore, which checks bug-creation rights).

const urlSchema = z.string().trim().url("Enter a full page address, starting with https://");
const nameSchema = z.string().trim().min(1, "Give the page a name.").max(120, "Keep the page name under 120 characters.");

/** A readable name from an address when none is typed: "https://site.com/about-us/team" → "about-us/team", or the host for "/". */
function nameFromUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/^\/+|\/+$/g, "");
    return (path || u.hostname).slice(0, 120);
  } catch {
    return raw.slice(0, 120);
  }
}

async function authorize(projectId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Your session has expired. Please sign in again.");
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { taskGroups: { select: { id: true, leadUserId: true, podId: true, pod: { select: { name: true } } } } },
  });
  if (!project || project.archivedAt) throw new Error("Project not found.");
  if (!canManageProjectPages(user, project)) throw new Error("You don't have permission to manage this project's pages.");
  return { user, project };
}

/** Add one or several pages at once (parallel pageNames[] / pageUrls[] from the add-rows form). */
export async function addProjectPages(projectId: string, formData: FormData) {
  return runAction(async () => {
    const { user } = await authorize(projectId);
    const names = formData.getAll("pageName").map(String);
    const urls = formData.getAll("pageUrl").map(String);
    const rows = urls
      .map((url, i) => ({ url: url.trim(), name: (names[i] ?? "").trim() }))
      .filter((r) => r.url.length > 0 || r.name.length > 0);
    if (rows.length === 0) throw new Error("Enter at least one page address.");

    const parsed = rows.map((r) => {
      const url = urlSchema.safeParse(r.url);
      if (!url.success) throw new Error(`"${r.url || r.name}": ${url.error.issues[0]?.message ?? "Enter a valid address."}`);
      const name = nameSchema.safeParse(r.name || nameFromUrl(url.data));
      if (!name.success) throw new Error(name.error.issues[0]?.message ?? "Give the page a name.");
      return { name: name.data, url: url.data };
    });

    const existing = await prisma.projectPage.findMany({ where: { projectId }, select: { name: true } });
    const taken = new Set(existing.map((p) => p.name.toLowerCase()));
    const seen = new Set<string>();
    for (const p of parsed) {
      const key = p.name.toLowerCase();
      if (taken.has(key) || seen.has(key)) throw new Error(`This project already has a page called "${p.name}".`);
      seen.add(key);
    }

    await prisma.projectPage.createMany({ data: parsed.map((p) => ({ projectId, name: p.name, url: p.url, createdById: user.id })) });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const, notice: `${parsed.length} ${parsed.length === 1 ? "page" : "pages"} added.` };
  });
}

export async function updateProjectPage(pageId: string, formData: FormData) {
  return runAction(async () => {
    const page = await prisma.projectPage.findUnique({ where: { id: pageId } });
    if (!page) throw new Error("This page no longer exists.");
    await authorize(page.projectId);
    const name = nameSchema.safeParse(formData.get("name"));
    if (!name.success) throw new Error(name.error.issues[0]?.message ?? "Give the page a name.");
    const url = urlSchema.safeParse(formData.get("url"));
    if (!url.success) throw new Error(url.error.issues[0]?.message ?? "Enter a valid address.");
    const clash = await prisma.projectPage.findFirst({
      where: { projectId: page.projectId, name: { equals: name.data, mode: "insensitive" }, id: { not: pageId } },
      select: { id: true },
    });
    if (clash) throw new Error(`This project already has a page called "${name.data}".`);
    await prisma.projectPage.update({ where: { id: pageId }, data: { name: name.data, url: url.data } });
    revalidatePath(`/projects/${page.projectId}`);
  });
}

/** Bugs filed on the page keep existing; they just lose the page link. */
export async function deleteProjectPage(pageId: string, _formData: FormData) {
  return runAction(async () => {
    const page = await prisma.projectPage.findUnique({ where: { id: pageId } });
    if (!page) throw new Error("This page no longer exists.");
    await authorize(page.projectId);
    await prisma.projectPage.delete({ where: { id: pageId } });
    revalidatePath(`/projects/${page.projectId}`);
  });
}
