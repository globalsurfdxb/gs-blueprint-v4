import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  canAccessContentCalendar,
  canViewContentCalendar,
  hidesCompletedProjects,
  CONTENT_POD_NAME,
  SOCIAL_MEDIA_POD_NAME,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatDate, MONTH_NAMES } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/dashboard-ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { UrgentIcon } from "./[projectId]/urgent-tag";

export default async function ContentCalendarIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessContentCalendar(user)) redirect("/");

  const { q: qParam } = await searchParams;
  const q = (qParam ?? "").trim();
  const needle = q.toLowerCase();

  const socialMediaGroups = await prisma.taskGroup.findMany({
    where: { pod: { name: SOCIAL_MEDIA_POD_NAME } },
    include: { project: { include: { client: true } }, lead: { select: { name: true } } },
    orderBy: { project: { name: "asc" } },
  });

  // Admin sees every project with a Social Media Task Group; a Social Media Lead sees ones
  // they lead; the overseeing Cluster Head (Ashna) sees ones in their pod scope — same
  // per-project authority the calendar page itself enforces (canViewContentCalendar).
  const allProjects = socialMediaGroups
    .filter((g) => canViewContentCalendar(user, g))
    // Archived projects drop out for everyone.
    .filter((g) => g.project.archivedAt === null)
    // Leads/Contributors don't see Completed projects; Admin & Cluster Heads (oversight) do.
    .filter((g) => !hidesCompletedProjects(user) || g.project.status !== "COMPLETED")
    .map((g) => ({ ...g.project, clientName: g.project.client.name, leadName: g.lead.name }));

  const projects = needle
    ? allProjects.filter((p) => `${p.name} ${p.clientName} ${p.leadName}`.toLowerCase().includes(needle))
    : allProjects;

  // This month's calendar for each project, plus the next post still to come: enough to see at a glance where the
  // work is without opening every calendar.
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const todayUtc = new Date(Date.UTC(year, now.getMonth(), now.getDate()));
  const ids = allProjects.map((p) => p.id);

  const [monthTasks, upcoming] = ids.length
    ? await Promise.all([
        prisma.task.findMany({
          where: { projectId: { in: ids }, publishDate: { gte: monthStart, lt: monthEnd }, parentTaskId: null },
          select: { projectId: true, status: true, isUrgent: true, group: { select: { pod: { select: { name: true } } } } },
        }),
        prisma.task.findMany({
          where: { projectId: { in: ids }, publishDate: { gte: todayUtc }, status: { not: "COMPLETED" }, parentTaskId: null },
          select: { projectId: true, publishDate: true },
          orderBy: { publishDate: "asc" },
        }),
      ])
    : [[], []];

  // The calendar lists Content-stage entries and urgent tasks (Design-stage follow-ups aren't separate entries).
  const stats = new Map<string, { entries: number; inProduction: number; urgent: number }>();
  for (const t of monthTasks) {
    if (!t.isUrgent && t.group?.pod?.name !== CONTENT_POD_NAME) continue;
    const s = stats.get(t.projectId) ?? { entries: 0, inProduction: 0, urgent: 0 };
    s.entries += 1;
    if (t.status !== "COMPLETED") s.inProduction += 1;
    if (t.isUrgent) s.urgent += 1;
    stats.set(t.projectId, s);
  }
  const nextPost = new Map<string, Date>();
  for (const t of upcoming) if (t.publishDate && !nextPost.has(t.projectId)) nextPost.set(t.projectId, t.publishDate);

  const totals = Array.from(stats.values()).reduce(
    (a, s) => ({ entries: a.entries + s.entries, inProduction: a.inProduction + s.inProduction, urgent: a.urgent + s.urgent }),
    { entries: 0, inProduction: 0, urgent: 0 },
  );

  return (
    <div>
      <PageHeader
        title="Content Calendar"
        description="Pick a project to plan its Social Media posts, edit the monthly brief or raise urgent work."
      />

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Projects" value={allProjects.length} icon="list" />
        <StatCard label={`Entries · ${MONTH_NAMES[month - 1]}`} value={totals.entries} icon="calendar" />
        <StatCard label="In production" value={totals.inProduction} icon="clock" />
        <StatCard label="Urgent" value={totals.urgent} icon="alert" tone={totals.urgent > 0 ? "danger" : "default"} attention />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold tracking-tight">
          Projects
          <span className="rounded-full bg-gs-light px-2 py-0.5 text-xs font-semibold tabular-nums text-gs-gray">
            {projects.length}
            {needle && allProjects.length !== projects.length ? ` of ${allProjects.length}` : ""}
          </span>
        </h2>
        {allProjects.length > 3 && (
          <AutoFilterForm className="w-full sm:w-80">
            <div className="relative">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gs-gray" aria-hidden>
                <circle cx="9" cy="9" r="5.5" />
                <path d="M13.5 13.5 17 17" />
              </svg>
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search project, client or lead…"
                aria-label="Search projects"
                className="field field-sm w-full pl-9"
              />
            </div>
          </AutoFilterForm>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-gs-gray/25 bg-white px-6 py-14 text-center">
          <p className="font-medium text-gs-black/80">
            {needle ? "No project matches your search" : "No project to show yet"}
          </p>
          <p className="mt-1 text-sm text-gs-gray">
            {needle
              ? "Try a different name, client or lead."
              : "A project shows here once it has a Social Media Task Group you lead or oversee: attach one from the project page."}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const s = stats.get(p.id) ?? { entries: 0, inProduction: 0, urgent: 0 };
            const next = nextPost.get(p.id);
            return (
              <Link
                key={p.id}
                href={`/content-calendar/${p.id}`}
                className="group flex flex-col rounded-2xl border border-gs-gray/10 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-gs-red/30 hover:shadow-lg hover:shadow-gs-black/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-heading text-base font-semibold tracking-tight group-hover:text-gs-red">{p.name}</h3>
                    <p className="mt-0.5 truncate text-sm text-gs-gray">{p.clientName}</p>
                  </div>
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gs-light text-gs-gray transition-colors group-hover:bg-gs-red group-hover:text-white"
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="M5 10h10M11 6l4 4-4 4" />
                    </svg>
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-gs-light/60 p-3 text-center">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Entries</dt>
                    <dd className="mt-0.5 font-heading text-xl font-bold tabular-nums">{s.entries}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">In production</dt>
                    <dd className="mt-0.5 font-heading text-xl font-bold tabular-nums">{s.inProduction}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Urgent</dt>
                    <dd className={`mt-0.5 flex items-center justify-center gap-1 font-heading text-xl font-bold tabular-nums ${s.urgent > 0 ? "text-gs-red" : ""}`}>
                      {s.urgent > 0 && <UrgentIcon className="h-3.5 w-3.5" />}
                      {s.urgent}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-gs-gray">
                  <span>
                    Lead: <span className="font-medium text-gs-black/80">{p.leadName}</span>
                  </span>
                  <span>
                    {next ? (
                      <>
                        Next post: <span className="font-medium text-gs-black/80">{formatDate(next)}</span>
                      </>
                    ) : (
                      "No upcoming post"
                    )}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
