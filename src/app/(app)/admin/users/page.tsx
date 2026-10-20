import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  CLUSTER_HEAD: "Cluster Head",
  LEAD: "Lead",
  ACCOUNT_CLIENT_SERVICES: "Account/Client Services",
  CONTRIBUTOR: "Contributor",
  ACCOUNTANT: "Accountant",
};

// A route handler (file download), not a page — a plain <a>, not <Link>, so the browser downloads it.
const EXPORT_HREF = "/admin/users/export";

export default async function UsersPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isAdmin(currentUser)) {
    redirect("/");
  }

  const users = await prisma.user.findMany({
    include: { roles: { include: { cluster: true, pod: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title={<>Users & Roles</>}
        actions={<>
          <div className="flex flex-wrap items-center gap-2">
          <a
            href={EXPORT_HREF}
            className="btn btn-secondary"
          >
            Export
          </a>
          <Link
            href="/admin/users/import"
            className="btn btn-secondary"
          >
            Import
          </Link>
          <Link
            href="/admin/users/new"
            className="btn btn-primary"
          >
            New User
          </Link>
        </div>
        </>}
      />

      <div className="mt-6 overflow-hidden rounded-lg border border-gs-gray/15 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
              <tr>
                <th className="whitespace-nowrap px-4 py-3">Name</th>
                <th className="whitespace-nowrap px-4 py-3">Email</th>
                <th className="whitespace-nowrap px-4 py-3">Location</th>
                <th className="whitespace-nowrap px-4 py-3">Roles</th>
                <th className="whitespace-nowrap px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-gs-gray/10">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">
                      {u.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gs-gray">{u.email}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gs-gray">{u.location}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 && <span className="text-gs-gray">No roles</span>}
                      {u.roles.map((r) => (
                        <span
                          key={r.id}
                          className="rounded-full bg-gs-light px-2 py-0.5 text-xs text-gs-black"
                        >
                          {ROLE_LABELS[r.role]}
                          {r.cluster ? ` · ${r.cluster.name}` : ""}
                          {r.pod ? ` · ${r.pod.name}` : ""}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {u.isActive ? (
                      <span className="text-gs-black">Active</span>
                    ) : (
                      <span className="text-gs-gray">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
