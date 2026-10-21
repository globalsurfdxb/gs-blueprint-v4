import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getManageableSprintProjects, getSprintList, getSprintProjectIds, type SprintListRow } from "@/lib/sprint-dashboard";
import { PageHeader } from "@/components/page-header";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { Select } from "@/components/select";
import { EmptyState, SectionCard } from "@/components/dashboard-ui";
import { SprintProgress } from "@/components/sprint-progress";
import { SprintLinkRow } from "./sprint-row";
import { NewSprintPanel } from "./new-sprint-panel";

const STATUS_STYLE: Record<SprintListRow["status"], { label: string; chip: string }> = {
  ACTIVE: { label: "Active", chip: "bg-green-100 text-green-700" },
  PLANNED: { label: "Planned", chip: "bg-gs-light text-gs-gray" },
  COMPLETED: { label: "Completed", chip: "bg-gs-black/5 text-gs-gray" },
};
const STATUS_ORDER: SprintListRow["status"][] = ["ACTIVE", "PLANNED", "COMPLETED"];

type SearchParams = { q?: string; project?: string; client?: string; status?: string; progress?: string };

/**
 * Sprints menu (Sprint Workflow, PRD 8.14): the sprints of every Sprint-enabled project this person
 * oversees or has work in, shown PROJECT BY PROJECT — each project is its own card with its sprints
 * (Active first, then Planned, then Completed). A filter bar narrows by free-text search, project,
 * client, status and progress, and applies as you change it. A sprint opens its board; "Manage
 * sprints" opens the project's Sprints tab. The menu item only shows when there is something to
 * list (see getSprintProjectIds).
 */
export default async function SprintsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const projectIds = await getSprintProjectIds(user);
  if (projectIds.length === 0) redirect("/");

  const [all, manageableProjects] = await Promise.all([
    getSprintList(projectIds),
    getManageableSprintProjects(user, projectIds),
  ]);

  // ---- filter options, built from the unfiltered list so every choice stays available ----
  const projectOptions = new Map<string, string>(); // id -> "Name · Client"
  const clientOptions = new Set<string>();
  for (const s of all) {
    projectOptions.set(s.projectId, `${s.projectName} · ${s.clientName}`);
    clientOptions.add(s.clientName);
  }
  const projects = Array.from(projectOptions.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  const clients = Array.from(clientOptions).sort((a, b) => a.localeCompare(b));
  const statusCount = (st: SprintListRow["status"]) => all.filter((s) => s.status === st).length;

  // ---- read + validate the filters ----
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const project = projectOptions.has(sp.project ?? "") ? (sp.project as string) : "";
  const client = clientOptions.has(sp.client ?? "") ? (sp.client as string) : "";
  const status = STATUS_ORDER.includes(sp.status as SprintListRow["status"]) ? (sp.status as SprintListRow["status"]) : "";
  const progress = ["not-started", "in-progress", "done"].includes(sp.progress ?? "") ? (sp.progress as string) : "";
  const anyFilter = !!(q || project || client || status || progress);

  const needle = q.toLowerCase();
  const filtered = all.filter(
    (s) =>
      (!project || s.projectId === project) &&
      (!client || s.clientName === client) &&
      (!status || s.status === status) &&
      (!progress ||
        (progress === "not-started" && s.completedTasks === 0) ||
        (progress === "in-progress" && s.completedTasks > 0 && s.completionPct < 100) ||
        (progress === "done" && s.totalTasks > 0 && s.completionPct === 100)) &&
      (!needle ||
        s.name.toLowerCase().includes(needle) ||
        s.projectName.toLowerCase().includes(needle) ||
        s.clientName.toLowerCase().includes(needle)),
  );

  // ---- group by project ----
  const byProject = new Map<string, { id: string; name: string; clientName: string; sprints: SprintListRow[] }>();
  for (const s of filtered) {
    const entry = byProject.get(s.projectId) ?? { id: s.projectId, name: s.projectName, clientName: s.clientName, sprints: [] };
    entry.sprints.push(s);
    byProject.set(s.projectId, entry);
  }
  const shown = Array.from(byProject.values()).sort(
    (a, b) => a.name.localeCompare(b.name) || a.clientName.localeCompare(b.clientName),
  );

  return (
    <div>
      <PageHeader
        title="Sprints"
        description={<>Sprints for each project you oversee or have sprint work on.</>}
      />

      <NewSprintPanel projects={manageableProjects} />

      {/* Filter bar — applies as you change it (search waits for a short pause). */}
      <AutoFilterForm className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-gs-gray/10 bg-white p-3 shadow-sm">
        <div className="flex w-full flex-col gap-1 sm:w-64">
          <label htmlFor="q" className="text-xs font-medium text-gs-gray">Search</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Sprint, project or client…"
            autoComplete="off"
            className="field field-sm w-full"
          />
        </div>

        {projects.length > 1 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="project" className="text-xs font-medium text-gs-gray">Project</label>
            <Select id="project" name="project" defaultValue={project} className="field field-sm min-w-48">
              <option value="">All projects</option>
              {projects.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </Select>
          </div>
        )}

        {clients.length > 1 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="client" className="text-xs font-medium text-gs-gray">Client</label>
            <Select id="client" name="client" defaultValue={client} className="field field-sm min-w-40">
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs font-medium text-gs-gray">Status</label>
          <Select id="status" name="status" defaultValue={status} className="field field-sm min-w-36">
            <option value="">All statuses</option>
            {STATUS_ORDER.map((st) => (
              <option key={st} value={st}>{STATUS_STYLE[st].label} ({statusCount(st)})</option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="progress" className="text-xs font-medium text-gs-gray">Progress</label>
          <Select id="progress" name="progress" defaultValue={progress} className="field field-sm min-w-36">
            <option value="">Any progress</option>
            <option value="not-started">Not started</option>
            <option value="in-progress">In progress</option>
            <option value="done">All tasks done</option>
          </Select>
        </div>

        <div className="flex min-h-9 items-center gap-3 pb-0.5 text-sm text-gs-gray sm:ml-auto">
          <span>
            {filtered.length} of {all.length} {all.length === 1 ? "sprint" : "sprints"}
          </span>
          {anyFilter && (
            <Link href="/sprints" className="font-medium text-gs-red hover:underline">
              Clear filters
            </Link>
          )}
        </div>
      </AutoFilterForm>

      {all.length === 0 && (
        <div className="mt-6">
          <SectionCard title="Sprints">
            <EmptyState text="No sprints yet — a Lead creates one from the project's Sprints tab." />
          </SectionCard>
        </div>
      )}

      {all.length > 0 && filtered.length === 0 && (
        <div className="mt-6">
          <SectionCard title="No matching sprints">
            <EmptyState text="Nothing matches these filters. Try a broader search, or clear the filters." />
          </SectionCard>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {shown.map((p) => {
          const active = p.sprints.filter((s) => s.status === "ACTIVE").length;
          return (
            <section key={p.id} className="overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gs-gray/10 px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[15px] font-semibold">{p.name}</h2>
                  <span className="text-sm text-gs-gray">{p.clientName}</span>
                  <span className="rounded-full bg-gs-light px-2 py-0.5 text-xs font-semibold tabular-nums text-gs-gray">
                    {p.sprints.length} {p.sprints.length === 1 ? "sprint" : "sprints"}
                  </span>
                  {active > 0 && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                      {active} active
                    </span>
                  )}
                </div>
                <Link href={`/projects/${p.id}?tab=sprints`} className="text-sm font-medium text-gs-red hover:underline">
                  Manage sprints →
                </Link>
              </header>

              <div className="table-scroll">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-2">Sprint</th>
                      <th className="whitespace-nowrap px-4 py-2">Status</th>
                      <th className="whitespace-nowrap px-4 py-2">Dates</th>
                      <th className="whitespace-nowrap px-4 py-2">Progress</th>
                      <th className="w-8" aria-label="Open" />
                    </tr>
                  </thead>
                  <tbody>
                    {p.sprints.map((s) => (
                      <SprintLinkRow
                        key={s.id}
                        href={`/projects/${s.projectId}?tab=sprints&sprint=${s.id}`}
                        label={`Open ${s.name}`}
                      >
                      
                        <td className="px-4 py-2.5">
                          <span className="font-medium group-hover:text-gs-red">{s.name}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[s.status].chip}`}
                          >
                            {STATUS_STYLE[s.status].label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">
                          {formatDate(s.startDate)} – {formatDate(s.endDate)}
                        </td>
                        <td className="min-w-52 px-4 py-2.5">
                          <SprintProgress counts={s.counts} />
                        </td>
                                            </SprintLinkRow>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
