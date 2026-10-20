import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canCreateProject, canViewProject, hidesCompletedProjects, isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { unarchiveProject } from "@/lib/actions/projects";
import { ProjectStatusChip, projectStatusLabel } from "@/components/status-chip";
import { PageHeader } from "@/components/page-header";
import { UnarchiveProjectButton } from "./unarchive-project-button";

const STATUS_ORDER = ["ACTIVE", "PLANNING", "PAUSED", "COMPLETED", "CANCELLED"] as const;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; status?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const admin = isAdmin(user);
  const sp = await searchParams;
  const showArchived = admin && sp.archived === "1";
  const statusFilter = STATUS_ORDER.find((s) => s === sp.status);
  const q = (sp.q ?? "").trim();

  const allProjects = await prisma.project.findMany({
    where: {
      AND: [
        // Leads and Contributors don't see finished projects (oversight roles still do).
        hidesCompletedProjects(user) ? { status: { not: "COMPLETED" } } : {},
        // Archived projects are hidden everywhere; Admin can open the archived-only view.
        showArchived ? { archivedAt: { not: null } } : { archivedAt: null },
      ],
    },
    include: {
      client: true,
      serviceType: true,
      cluster: true,
      taskGroups: { include: { lead: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const visible = await Promise.all(
    allProjects.map(async (p) => ((await canViewProject(user, p)) ? p : null)),
  );
  const projects = visible.filter((p): p is NonNullable<typeof p> => p !== null);

  // Filtering happens AFTER the permission check, on what this viewer may already see — the
  // status counts below therefore never reveal a project they couldn't open.
  const needle = q.toLowerCase();
  const filtered = projects.filter(
    (p) =>
      (!statusFilter || p.status === statusFilter) &&
      (!needle ||
        p.name.toLowerCase().includes(needle) ||
        p.client.name.toLowerCase().includes(needle) ||
        (p.referenceNumber ?? "").toLowerCase().includes(needle)),
  );

  const counts = new Map<string, number>();
  for (const p of projects) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
  const presentStatuses = STATUS_ORDER.filter((s) => counts.has(s));

  const canCreateAnywhere = canCreateProject(user);
  const now = new Date();

  const hrefFor = (status?: string) => {
    const params = new URLSearchParams();
    if (showArchived) params.set("archived", "1");
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `/projects?${qs}` : "/projects";
  };

  const filtersActive = !!statusFilter || !!q;

  return (
    <div>
      <PageHeader
        title={showArchived ? "Archived Projects" : "Projects"}
        description={
          <>
            {projects.length} {projects.length === 1 ? "project" : "projects"} you can see
            {showArchived ? " — archived, hidden from every listing and report." : "."}
          </>
        }
        actions={
          <>
            {admin &&
              (showArchived ? (
                <Link href="/projects" className="text-sm font-medium text-gs-red hover:underline">
                  ← Back to active projects
                </Link>
              ) : (
                <Link href="/projects?archived=1" className="text-sm font-medium text-gs-gray hover:text-gs-black hover:underline">
                  Archived
                </Link>
              ))}
            {canCreateAnywhere && !showArchived && (
              <Link href="/projects/new" className="btn btn-primary">
                New Project
              </Link>
            )}
          </>
        }
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          <Link
            href={hrefFor()}
            aria-current={!statusFilter ? "page" : undefined}
            className={`flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ${
              !statusFilter ? "bg-gs-black text-white" : "bg-white text-gs-gray shadow-sm hover:text-gs-black"
            }`}
          >
            All <span className="tabular-nums opacity-70">{projects.length}</span>
          </Link>
          {presentStatuses.map((s) => (
            <Link
              key={s}
              href={hrefFor(s)}
              aria-current={statusFilter === s ? "page" : undefined}
              className={`flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ${
                statusFilter === s ? "bg-gs-black text-white" : "bg-white text-gs-gray shadow-sm hover:text-gs-black"
              }`}
            >
              {projectStatusLabel(s)} <span className="tabular-nums opacity-70">{counts.get(s)}</span>
            </Link>
          ))}
        </nav>

        <form action="/projects" role="search" className="flex w-full items-center gap-2 sm:w-auto">
          {showArchived && <input type="hidden" name="archived" value="1" />}
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            aria-label="Search projects"
            placeholder="Search name, client or reference"
            className="field w-full sm:w-72"
          />
        </form>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-gs-gray/15 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
              <tr>
                <th className="whitespace-nowrap px-4 py-3">Project</th>
                <th className="whitespace-nowrap px-4 py-3">Client</th>
                <th className="whitespace-nowrap px-4 py-3">Service Type</th>
                <th className="whitespace-nowrap px-4 py-3">Deadline</th>
                <th className="whitespace-nowrap px-4 py-3">Status</th>
                {showArchived && <th className="whitespace-nowrap px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={showArchived ? 6 : 5} className="px-4 py-14 text-center">
                    <p className="font-medium">
                      {filtersActive
                        ? "No projects match these filters."
                        : showArchived
                          ? "No archived projects."
                          : "No projects yet."}
                    </p>
                    <p className="mt-1 text-gs-gray">
                      {filtersActive ? (
                        <Link href={showArchived ? "/projects?archived=1" : "/projects"} className="text-gs-red hover:underline">
                          Clear filters
                        </Link>
                      ) : canCreateAnywhere && !showArchived ? (
                        <Link href="/projects/new" className="text-gs-red hover:underline">
                          Create the first project
                        </Link>
                      ) : null}
                    </p>
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const overdue =
                  !!p.deadline && p.deadline < now && p.status !== "COMPLETED" && p.status !== "CANCELLED";
                return (
                  <tr key={p.id} className="border-t border-gs-gray/10">
                    <td className="px-4 py-3">
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      {p.referenceNumber && <p className="text-xs text-gs-gray">{p.referenceNumber}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gs-gray">{p.client.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gs-gray">{p.serviceType.name}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {p.deadline ? (
                        <span className={overdue ? "font-medium text-gs-red" : "text-gs-gray"}>
                          {formatDate(p.deadline)}
                          {overdue && <span className="ml-1.5 text-xs">Overdue</span>}
                        </span>
                      ) : (
                        <span className="text-gs-gray/60">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <ProjectStatusChip status={p.status} />
                    </td>
                    {showArchived && (
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <UnarchiveProjectButton action={unarchiveProject.bind(null, p.id)} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
