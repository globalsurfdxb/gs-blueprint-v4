import Link from "next/link";
import { LinkRow } from "@/components/link-row";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canCreateProject, canViewProject, hidesCompletedProjects, isAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { unarchiveProject } from "@/lib/actions/projects";
import { ProjectStatusChip, projectStatusLabel } from "@/components/status-chip";
import { PageHeader } from "@/components/page-header";
import { UnarchiveProjectButton } from "./unarchive-project-button";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { Select } from "@/components/select";

const STATUS_ORDER = ["ACTIVE", "PLANNING", "PAUSED", "COMPLETED", "CANCELLED"] as const;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    archived?: string;
    status?: string;
    q?: string;
    client?: string;
    service?: string;
    cluster?: string;
    deadline?: string;
    sort?: string;
  }>;
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
  const now = new Date();
  const DAY = 24 * 60 * 60 * 1000;
  const DEADLINE_OPTIONS = [
    { value: "overdue", label: "Overdue" },
    { value: "7d", label: "Due in 7 days" },
    { value: "30d", label: "Due in 30 days" },
    { value: "none", label: "No deadline" },
  ] as const;
  const SORT_OPTIONS = [
    { value: "newest", label: "Newest first" },
    { value: "name", label: "Name A–Z" },
    { value: "deadline", label: "Deadline (soonest)" },
  ] as const;
  const deadlineFilter = DEADLINE_OPTIONS.find((o) => o.value === sp.deadline)?.value ?? "";
  const sort = SORT_OPTIONS.find((o) => o.value === sp.sort)?.value ?? "newest";

  const clientOptions = Array.from(new Map(projects.map((p) => [p.client.id, p.client.name])).entries()).sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const serviceOptions = Array.from(new Map(projects.map((p) => [p.serviceType.id, p.serviceType.name])).entries()).sort(
    (a, b) => a[1].localeCompare(b[1]),
  );
  const clusterOptions = Array.from(new Map(projects.map((p) => [p.cluster.id, p.cluster.name])).entries()).sort((a, b) =>
    a[1].localeCompare(b[1]),
  );
  const clientFilter = clientOptions.some(([id]) => id === sp.client) ? (sp.client ?? "") : "";
  const serviceFilter = serviceOptions.some(([id]) => id === sp.service) ? (sp.service ?? "") : "";
  const clusterFilter = clusterOptions.some(([id]) => id === sp.cluster) ? (sp.cluster ?? "") : "";

  const isOpen = (p: (typeof projects)[number]) => p.status !== "COMPLETED" && p.status !== "CANCELLED";
  const matchesDeadline = (p: (typeof projects)[number]) => {
    if (!deadlineFilter) return true;
    if (deadlineFilter === "none") return !p.deadline;
    if (!p.deadline || !isOpen(p)) return false;
    if (deadlineFilter === "overdue") return p.deadline < now;
    const days = deadlineFilter === "7d" ? 7 : 30;
    return p.deadline >= now && p.deadline.getTime() - now.getTime() <= days * DAY;
  };

  const filtered = projects
    .filter(
      (p) =>
        (!statusFilter || p.status === statusFilter) &&
        (!clientFilter || p.client.id === clientFilter) &&
        (!serviceFilter || p.serviceType.id === serviceFilter) &&
        (!clusterFilter || p.cluster.id === clusterFilter) &&
        matchesDeadline(p) &&
        (!needle ||
          p.name.toLowerCase().includes(needle) ||
          p.client.name.toLowerCase().includes(needle) ||
          (p.referenceNumber ?? "").toLowerCase().includes(needle)),
    )
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "deadline") {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.getTime() - b.deadline.getTime();
      }
      return 0; // already newest-first from the query
    });

  const counts = new Map<string, number>();
  for (const p of projects) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
  const presentStatuses = STATUS_ORDER.filter((s) => counts.has(s));

  const canCreateAnywhere = canCreateProject(user);

  const filtersActive =
    !!statusFilter || !!q || !!clientFilter || !!serviceFilter || !!clusterFilter || !!deadlineFilter;
  const clearHref = showArchived ? "/projects?archived=1" : "/projects";

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

      <AutoFilterForm className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-gs-gray/10 bg-white p-3 shadow-sm">
        {showArchived && <input type="hidden" name="archived" value="1" />}

        <div className="flex w-full flex-col gap-1 sm:w-72">
          <label htmlFor="q" className="text-xs font-medium text-gs-gray">Search</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Name, client or reference…"
            autoComplete="off"
            className="field field-sm w-full"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs font-medium text-gs-gray">Status</label>
          <Select id="status" name="status" defaultValue={statusFilter ?? ""} className="field field-sm min-w-40">
            <option value="">All statuses ({projects.length})</option>
            {presentStatuses.map((st) => (
              <option key={st} value={st}>
                {projectStatusLabel(st)} ({counts.get(st)})
              </option>
            ))}
          </Select>
        </div>

        {clientOptions.length > 1 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="client" className="text-xs font-medium text-gs-gray">Client</label>
            <Select id="client" name="client" defaultValue={clientFilter} className="field field-sm min-w-44">
              <option value="">All clients</option>
              {clientOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
          </div>
        )}

        {serviceOptions.length > 1 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="service" className="text-xs font-medium text-gs-gray">Service type</label>
            <Select id="service" name="service" defaultValue={serviceFilter} className="field field-sm min-w-40">
              <option value="">All services</option>
              {serviceOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
          </div>
        )}

        {clusterOptions.length > 1 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="cluster" className="text-xs font-medium text-gs-gray">Cluster</label>
            <Select id="cluster" name="cluster" defaultValue={clusterFilter} className="field field-sm min-w-44">
              <option value="">All clusters</option>
              {clusterOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="deadline" className="text-xs font-medium text-gs-gray">Deadline</label>
          <Select id="deadline" name="deadline" defaultValue={deadlineFilter} className="field field-sm min-w-40">
            <option value="">Any deadline</option>
            {DEADLINE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="sort" className="text-xs font-medium text-gs-gray">Sort by</label>
          <Select id="sort" name="sort" defaultValue={sort} className="field field-sm min-w-40">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>

        {filtersActive && (
          <Link href={clearHref} className="mb-1.5 text-sm font-medium text-gs-red hover:underline">
            Clear filters
          </Link>
        )}
      </AutoFilterForm>

      <p className="mt-4 text-xs text-gs-gray">
        Showing {filtered.length} of {projects.length} {projects.length === 1 ? "project" : "projects"}
      </p>

      <div className="mt-2 overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-gs-gray/10 bg-gs-light/70 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
              <tr>
                <th className="whitespace-nowrap px-5 py-3">Project</th>
                <th className="whitespace-nowrap px-4 py-3">Client</th>
                <th className="whitespace-nowrap px-4 py-3">Service Type</th>
                <th className="whitespace-nowrap px-4 py-3">Deadline</th>
                <th className="whitespace-nowrap px-4 py-3">Status</th>
                {showArchived && <th className="whitespace-nowrap px-4 py-3"></th>}
                <th className="w-10 px-3 py-3" aria-hidden></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={showArchived ? 7 : 6} className="px-4 py-14 text-center">
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
                  <LinkRow key={p.id} href={`/projects/${p.id}`} className="border-t border-gs-gray/10">
                    <td className="px-5 py-4">
                      <Link href={`/projects/${p.id}`} className="font-semibold text-gs-black hover:text-gs-red hover:underline">
                        {p.name}
                      </Link>
                      {p.referenceNumber && <p className="mt-0.5 text-xs tabular-nums text-gs-gray">{p.referenceNumber}</p>}
                    </td>
                    <td className="px-4 py-4 text-gs-black/80">{p.client.name}</td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <span className="rounded-md bg-gs-black/5 px-2 py-0.5 text-xs font-medium text-gs-black/70">
                        {p.serviceType.name}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      {p.deadline ? (
                        <>
                          <span className={overdue ? "font-medium text-gs-red" : "text-gs-black/80"}>{formatDate(p.deadline)}</span>
                          {overdue && <p className="mt-0.5 text-xs font-medium text-gs-red">Overdue</p>}
                        </>
                      ) : (
                        <span className="text-gs-gray/60">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <ProjectStatusChip status={p.status} />
                    </td>
                    {showArchived && (
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <UnarchiveProjectButton action={unarchiveProject.bind(null, p.id)} />
                      </td>
                    )}
                    <td className="px-3 py-4 text-right text-gs-gray/50" aria-hidden>
                      ›
                    </td>
                  </LinkRow>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
