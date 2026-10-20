"use server";

import { randomInt } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { ROLE_LABELS, ROLE_VALUES, clusterIsOptional, isUnscopedRole, type RoleValue } from "@/lib/user-roles";

// Bulk user import (.xlsx or .csv). Mirrors createUser's rules row by row, but is all-or-nothing:
// every row is validated first and, if any row is bad, NOTHING is created — a half-imported
// roster is harder to clean up than a file with a few typos to fix. Rows whose email already
// exists are skipped (never overwritten), so re-importing an export is harmless.

export type UserImportState =
  | {
      fatal?: string;
      rowErrors?: { row: number; email: string; message: string }[];
      created?: number;
      skipped?: { row: number; email: string }[];
      // Passwords generated for rows that left the Password column blank. Returned once, to the
      // admin who ran the import; there is no way to read them back later (only the hash is stored).
      credentials?: { name: string; email: string; password: string }[];
    }
  | undefined;

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 200;
// Left in the downloadable template as a sample row; ignored if it's still there on upload.
const TEMPLATE_EXAMPLE_EMAIL = "example.person@globalsurf.ae";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const ROLE_BY_NORM = new Map<string, RoleValue>();
for (const r of ROLE_VALUES) {
  ROLE_BY_NORM.set(norm(r), r);
  ROLE_BY_NORM.set(norm(ROLE_LABELS[r]), r);
}

const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generatePassword(length = 12) {
  let out = "";
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return out;
}

type RawRow = { row: number; cells: Record<string, string> };

const KNOWN_HEADERS = ["name", "email", "location", "role", "cluster", "pod", "restrictedpods", "status", "password"];

async function readRows(file: File): Promise<RawRow[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } else if (lower.endsWith(".csv")) {
    await wb.csv.read(Readable.from(buffer));
  } else {
    throw new Error("Upload an .xlsx or .csv file.");
  }

  const ws = wb.worksheets[0];
  if (!ws) throw new Error("The file has no sheet.");

  const headerRow = ws.getRow(1);
  const columnOf = new Map<string, number>();
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const key = norm(cell.text ?? "");
    if (KNOWN_HEADERS.includes(key) && !columnOf.has(key)) columnOf.set(key, col);
  });
  for (const required of ["name", "email", "location", "role"]) {
    if (!columnOf.has(required)) {
      throw new Error(`Missing column "${required[0].toUpperCase()}${required.slice(1)}". Use the template's header row.`);
    }
  }

  const rows: RawRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: Record<string, string> = {};
    let any = false;
    for (const [key, col] of columnOf) {
      const text = (row.getCell(col).text ?? "").trim();
      cells[key] = text;
      if (text) any = true;
    }
    if (any) rows.push({ row: rowNumber, cells });
  });
  return rows;
}

export async function importUsers(_prev: UserImportState, formData: FormData): Promise<UserImportState> {
  const admin = await getCurrentUser();
  if (!admin || !isAdmin(admin)) return { fatal: "Admin access required." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { fatal: "Choose a file to import." };
  if (file.size > MAX_BYTES) return { fatal: "File is too large (2 MB max)." };

  let rows: RawRow[];
  try {
    rows = await readRows(file);
  } catch (err) {
    return { fatal: err instanceof Error ? err.message : "Could not read the file." };
  }
  rows = rows.filter((r) => r.cells.email.toLowerCase() !== TEMPLATE_EXAMPLE_EMAIL);
  if (rows.length === 0) return { fatal: "No user rows found in the file." };
  if (rows.length > MAX_ROWS) return { fatal: `Too many rows (${rows.length}); import at most ${MAX_ROWS} at a time.` };

  const [clusters, existingUsers] = await Promise.all([
    prisma.cluster.findMany({ include: { pods: true } }),
    prisma.user.findMany({ select: { email: true } }),
  ]);
  const clusterByName = new Map(clusters.map((c) => [norm(c.name), c]));
  const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

  const emailSchema = z.string().email();
  const rowErrors: { row: number; email: string; message: string }[] = [];
  const skipped: { row: number; email: string }[] = [];
  const seenInFile = new Map<string, number>();
  const toCreate: {
    name: string;
    email: string;
    location: "DUBAI" | "INDIA";
    isActive: boolean;
    role: RoleValue;
    clusterId: string | null;
    podId: string | null;
    restrictedPodIds: string[];
    password: string;
    generated: boolean;
  }[] = [];

  for (const { row, cells } of rows) {
    const email = cells.email.toLowerCase();
    const fail = (message: string) => rowErrors.push({ row, email: cells.email, message });

    if (!emailSchema.safeParse(email).success) {
      fail("Enter a valid email.");
      continue;
    }
    const firstSeen = seenInFile.get(email);
    if (firstSeen) {
      fail(`Duplicate of row ${firstSeen} in this file.`);
      continue;
    }
    seenInFile.set(email, row);
    if (existingEmails.has(email)) {
      skipped.push({ row, email: cells.email });
      continue;
    }

    const problems: string[] = [];
    if (!cells.name) problems.push("Name is required.");

    const locationKey = norm(cells.location);
    const location = locationKey === "dubai" ? "DUBAI" : locationKey === "india" ? "INDIA" : null;
    if (!location) problems.push("Location must be Dubai or India.");

    const role = ROLE_BY_NORM.get(norm(cells.role));
    if (!role) problems.push(`Role must be one of: ${ROLE_VALUES.map((r) => ROLE_LABELS[r]).join(", ")}.`);

    const statusKey = norm(cells.status ?? "");
    if (statusKey && statusKey !== "active" && statusKey !== "inactive") problems.push("Status must be Active or Inactive.");

    const password = cells.password ?? "";
    if (password && password.length < 8) problems.push("Password must be at least 8 characters.");

    let clusterId: string | null = null;
    let podId: string | null = null;
    let restrictedPodIds: string[] = [];

    if (role) {
      const clusterName = cells.cluster ?? "";
      const cluster = clusterName ? clusterByName.get(norm(clusterName)) : undefined;
      if (clusterName && !cluster) problems.push(`Unknown cluster "${clusterName}".`);

      if (isUnscopedRole(role)) {
        if (clusterName) problems.push(`${ROLE_LABELS[role]} can't be scoped to a cluster; leave Cluster blank.`);
      } else if (!clusterName && !clusterIsOptional(role)) {
        problems.push(`A cluster is required for ${ROLE_LABELS[role]}.`);
      } else if (cluster) {
        clusterId = cluster.id;
      }

      const podName = cells.pod ?? "";
      if (podName) {
        if (role !== "LEAD" && role !== "CONTRIBUTOR") {
          problems.push("Pod applies to Lead and Contributor only.");
        } else if (cluster) {
          const pod = cluster.pods.find((p) => norm(p.name) === norm(podName));
          if (pod) podId = pod.id;
          else problems.push(`Pod "${podName}" isn't in ${cluster.name}.`);
        }
      }

      const restricted = (cells.restrictedpods ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (restricted.length > 0) {
        if (role !== "CLUSTER_HEAD") {
          problems.push("Restricted Pods applies to Cluster Head only.");
        } else if (cluster) {
          for (const name of restricted) {
            const pod = cluster.pods.find((p) => norm(p.name) === norm(name));
            if (pod) restrictedPodIds.push(pod.id);
            else problems.push(`Restricted pod "${name}" isn't in ${cluster.name}.`);
          }
          restrictedPodIds = [...new Set(restrictedPodIds)];
        }
      }
    }

    if (problems.length > 0 || !role || !location) {
      fail(problems.join(" "));
      continue;
    }

    toCreate.push({
      name: cells.name,
      email,
      location,
      isActive: statusKey !== "inactive",
      role,
      clusterId,
      podId,
      restrictedPodIds,
      password: password || generatePassword(),
      generated: !password,
    });
  }

  if (rowErrors.length > 0) return { rowErrors, skipped };
  if (toCreate.length === 0) return { created: 0, skipped };

  // Hash outside the transaction (bcrypt at cost 12 is slow; don't hold a DB transaction open).
  const hashes: string[] = [];
  for (const u of toCreate) hashes.push(await bcrypt.hash(u.password, 12));

  try {
    await prisma.$transaction(
      toCreate.map((u, i) =>
        prisma.user.create({
          data: {
            name: u.name,
            email: u.email,
            passwordHash: hashes[i],
            location: u.location,
            isActive: u.isActive,
            roles: {
              create: {
                role: u.role,
                clusterId: u.clusterId,
                podId: u.podId,
                ...(u.restrictedPodIds.length > 0
                  ? { restrictedPods: { create: u.restrictedPodIds.map((podId) => ({ podId })) } }
                  : {}),
              },
            },
          },
        }),
      ),
    );
  } catch {
    // Most likely a unique-email race with another admin; nothing was committed.
    return { fatal: "Import failed and no users were created. Check for duplicate emails and try again." };
  }

  revalidatePath("/admin/users");
  return {
    created: toCreate.length,
    skipped,
    credentials: toCreate.filter((u) => u.generated).map((u) => ({ name: u.name, email: u.email, password: u.password })),
  };
}
