import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS, ROLE_VALUES } from "@/lib/user-roles";

// Users & Roles — Excel (.xlsx) export, and (with ?template=1) the blank import template.
// Admin-only, like the page it hangs off. Password hashes are never exported. The export uses the
// same column names the importer reads, so an exported file can be edited and re-imported (rows
// whose email already exists are skipped by the importer, never overwritten).

export const runtime = "nodejs";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } } as const;

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const template = req.nextUrl.searchParams.get("template") === "1";

  const wb = new ExcelJS.Workbook();
  wb.creator = "GS Blueprint";
  wb.created = new Date();

  if (template) {
    const clusters = await prisma.cluster.findMany({
      include: { pods: { orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    });

    const ws = wb.addWorksheet("Users");
    ws.columns = [
      { header: "Name", key: "name", width: 26 },
      { header: "Email", key: "email", width: 32 },
      { header: "Location", key: "location", width: 12 },
      { header: "Role", key: "role", width: 26 },
      { header: "Cluster", key: "cluster", width: 34 },
      { header: "Pod", key: "pod", width: 22 },
      { header: "Restricted Pods", key: "restrictedPods", width: 30 },
      { header: "Status", key: "status", width: 10 },
      { header: "Password", key: "password", width: 22 },
    ];
    styleHeader(ws);
    ws.addRow({
      name: "Example Person",
      email: "example.person@globalsurf.ae",
      location: "Dubai",
      role: "Contributor",
      cluster: clusters[0]?.name ?? "",
      pod: clusters[0]?.pods[0]?.name ?? "",
      restrictedPods: "",
      status: "Active",
      password: "",
    });
    ws.getRow(2).font = { italic: true, color: { argb: "FF999999" } };

    const ref = wb.addWorksheet("Reference");
    ref.columns = [
      { header: "Field", key: "field", width: 20 },
      { header: "Allowed values / rules", key: "rules", width: 100 },
    ];
    styleHeader(ref);
    ref.addRows([
      { field: "Name, Email", rules: "Required. Email must be unique; rows whose email already exists are skipped, never overwritten." },
      { field: "Location", rules: "Dubai or India." },
      { field: "Role", rules: ROLE_VALUES.map((r) => ROLE_LABELS[r]).join(" | ") },
      { field: "Cluster", rules: "Required for Cluster Head, Lead and Contributor. Optional for Account/Client Services. Leave blank for Admin and Accountant." },
      { field: "Pod", rules: "Optional, Lead and Contributor only. Must belong to the Cluster on the same row." },
      { field: "Restricted Pods", rules: "Optional, Cluster Head only. Comma-separated pod names from the Cluster; blank means full-cluster access." },
      { field: "Status", rules: "Active (default) or Inactive." },
      { field: "Password", rules: "Optional, at least 8 characters. Blank = a random password is generated and shown once after the import." },
    ]);
    ref.addRow({});
    ref.addRow({ field: "Clusters and pods", rules: "" }).font = { bold: true };
    for (const c of clusters) {
      ref.addRow({ field: c.name, rules: c.pods.map((p) => p.name).join(", ") || "(no pods)" });
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": 'attachment; filename="users-import-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  }

  const users = await prisma.user.findMany({
    include: { roles: { include: { cluster: true, pod: true, restrictedPods: { include: { pod: true } } } } },
    orderBy: { name: "asc" },
  });

  const ws = wb.addWorksheet("Users");
  ws.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Email", key: "email", width: 32 },
    { header: "Location", key: "location", width: 12 },
    { header: "Role", key: "role", width: 26 },
    { header: "Cluster", key: "cluster", width: 34 },
    { header: "Pod", key: "pod", width: 22 },
    { header: "Restricted Pods", key: "restrictedPods", width: 30 },
    { header: "Status", key: "status", width: 10 },
  ];
  styleHeader(ws);

  for (const u of users) {
    // Every user holds exactly one role (unique constraint on UserRole.userId); a user with
    // none still gets a row so the export is a complete roster.
    const r = u.roles[0];
    ws.addRow({
      name: u.name,
      email: u.email,
      location: u.location === "DUBAI" ? "Dubai" : "India",
      role: r ? ROLE_LABELS[r.role] : "",
      cluster: r?.cluster?.name ?? "",
      pod: r?.pod?.name ?? "",
      restrictedPods: r?.restrictedPods.map((rp) => rp.pod.name).join(", ") ?? "",
      status: u.isActive ? "Active" : "Inactive",
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="users-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
