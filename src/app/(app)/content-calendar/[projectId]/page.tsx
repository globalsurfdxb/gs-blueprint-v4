import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  canCreateUrgentCalendarTask,
  canManageContentCalendar,
  canViewContentCalendar,
  SOCIAL_MEDIA_POD_NAME,
  CONTENT_POD_NAME,
  DESIGN_POD_NAME,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  createCalendarEntry,
  createUrgentCalendarTask,
  updateCalendarEntryDate,
  updateCalendarEntryTitle,
} from "@/lib/actions/content-calendar";
import { AddUrgentTaskForm, type UrgentTeam } from "./add-urgent-task-form";
import { EntryPanels, OpenPanelButton } from "./entry-panels";
import { UrgentIcon, UrgentTag } from "./urgent-tag";
import { upsertMonthlyBrief } from "@/lib/actions/monthly-briefs";
import { MONTH_NAMES } from "@/lib/format";
import { MonthYearPicker } from "./month-year-picker";
import { MonthlyBriefForm } from "./monthly-brief-form";
import { AddEntryForm } from "./add-entry-form";
import { CalendarGrid } from "./calendar-grid";
import { EditEntryDate } from "./edit-entry-date";
import { EditEntryTitle } from "./edit-entry-title";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/dashboard-ui";
import { TaskStatusChip } from "@/components/task-chips";
import { statusLabel } from "@/lib/bug";

export default async function ContentCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ month?: string; year?: string; view?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { projectId } = await params;
  const { month: monthParam, year: yearParam, view: viewParam } = await searchParams;

  const now = new Date();
  const month = Number(monthParam) || now.getMonth() + 1;
  const year = Number(yearParam) || now.getFullYear();
  const view = viewParam === "calendar" ? "calendar" : "list";

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });
  if (!project) notFound();

  const socialMediaGroup = await prisma.taskGroup.findFirst({
    where: { projectId, pod: { name: SOCIAL_MEDIA_POD_NAME } },
    include: { lead: true },
  });
  if (!canViewContentCalendar(user, socialMediaGroup)) {
    redirect("/content-calendar");
  }
  // Admin + the Social Media Lead can add entries, reschedule, and edit the Monthly Brief;
  // an overseeing Cluster Head (Ashna) can view and edit topics only.
  const canManage = canManageContentCalendar(user, socialMediaGroup);

  if (!socialMediaGroup) {
    return (
      <div className="page-md">
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="mt-4 text-sm text-gs-gray">
          No Social Media Task Group is attached to this project yet — attach one from the project page
          before creating a Content Calendar for it.
        </p>
      </div>
    );
  }

  // The Social Media Lead plans the calendar and owns the Monthly Brief, but each entry's
  // task is created in the project's Content Task Group (a distinct production stage) —
  // that group must be attached too before entries can be added.
  const contentGroup = await prisma.taskGroup.findFirst({
    where: { projectId, pod: { name: CONTENT_POD_NAME } },
    include: { lead: true },
  });
  if (!contentGroup) {
    return (
      <div className="page-md">
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="mt-4 text-sm text-gs-gray">
          No Content Task Group is attached to this project yet — attach one from the project page before
          adding calendar entries (they&apos;re created there, not in Social Media&apos;s own group).
        </p>
      </div>
    );
  }

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  // Urgent tasks (raised by the Social Media Cluster Head, possibly in the Design group too) show on the calendar
  // beside the regular Content entries.
  const canUrgent = canCreateUrgentCalendarTask(user, socialMediaGroup);
  const [monthlyBrief, entries, contentTypes, designGroup] = await Promise.all([
    prisma.monthlyBrief.findUnique({ where: { projectId_month_year: { projectId, month, year } } }),
    prisma.task.findMany({
      where: {
        projectId,
        OR: [{ groupId: contentGroup.id }, { isUrgent: true }],
        publishDate: { gte: monthStart, lt: monthEnd },
      },
      include: {
        contentType: true,
        group: { select: { pod: { select: { name: true } } } },
        assignedTo: { select: { name: true } },
      },
      orderBy: [{ publishDate: "asc" }, { isUrgent: "desc" }],
    }),
    prisma.contentType.findMany({ orderBy: { name: "asc" } }),
    prisma.taskGroup.findFirst({ where: { projectId, pod: { name: DESIGN_POD_NAME } }, include: { lead: true } }),
  ]);

  // Teams the urgent-task form can send work to; each task goes to that team's Lead.
  const urgentTeams: UrgentTeam[] = canUrgent
    ? [
        { groupId: contentGroup.id, name: "Content", leadName: contentGroup.lead.name },
        ...(designGroup ? [{ groupId: designGroup.id, name: "Design", leadName: designGroup.lead.name }] : []),
      ]
    : [];

  const upsertBriefWithId = upsertMonthlyBrief.bind(null, projectId);
  const createEntryWithId = createCalendarEntry.bind(null, projectId);
  const createUrgentWithId = createUrgentCalendarTask.bind(null, projectId);

  // Preserve the selected month/year when switching views.
  const viewHref = (v: "list" | "calendar") => `?view=${v}&month=${month}&year=${year}`;

  const calendarEntries = entries.map((t) => ({
    id: t.id,
    projectId,
    title: t.name,
    contentType: t.contentType?.name ?? null,
    day: Number(t.publishDate!.toISOString().slice(8, 10)),
    urgent: t.isUrgent,
    team: t.group?.pod?.name ?? null,
  }));

  // Month at a glance.
  const urgentCount = entries.filter((t) => t.isUrgent).length;
  const completedCount = entries.filter((t) => t.status === "COMPLETED").length;
  const inProductionCount = entries.length - completedCount;
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  const toggleBase = "flex h-8 items-center gap-1.5 rounded-lg px-4 text-[0.8125rem] font-medium transition-colors";
  const activeToggle = "bg-white text-gs-black shadow-sm";
  const inactiveToggle = "text-gs-gray hover:text-gs-black";

  return (
    <div>
      <PageHeader
        eyebrow={project.client.name}
        title={`${project.name} · Content Calendar`}
        description={
          <>
            Social Media Lead: <span className="font-medium text-gs-black/80">{socialMediaGroup.lead.name}</span> · Content
            Lead: <span className="font-medium text-gs-black/80">{contentGroup.lead.name}</span>
            {designGroup && (
              <>
                {" "}
                · Design Lead: <span className="font-medium text-gs-black/80">{designGroup.lead.name}</span>
              </>
            )}
          </>
        }
        actions={
          <>
            <Link href={`/projects/${projectId}`} className="btn btn-secondary btn-sm">
              Open project
            </Link>
            {canUrgent &&
              (view === "list" ? (
                <OpenPanelButton tab="urgent" className="btn btn-secondary btn-sm !border-gs-red/40 text-gs-red hover:!bg-gs-red/10">
                  <UrgentIcon /> Urgent task
                </OpenPanelButton>
              ) : (
                <Link href={viewHref("list")} className="btn btn-secondary btn-sm !border-gs-red/40 text-gs-red hover:!bg-gs-red/10">
                  <UrgentIcon /> Urgent task
                </Link>
              ))}
            {canManage &&
              (view === "list" ? (
                <OpenPanelButton tab="entry" className="btn btn-primary btn-sm">
                  + Add entry
                </OpenPanelButton>
              ) : (
                <Link href={viewHref("list")} className="btn btn-primary btn-sm">
                  + Add entry
                </Link>
              ))}
          </>
        }
      />

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-gs-gray/10 bg-white p-4 shadow-sm">
        <MonthYearPicker month={month} year={year} monthNames={MONTH_NAMES} view={view} />
        <div role="tablist" aria-label="Calendar view" className="inline-flex gap-0.5 rounded-[0.625rem] bg-gs-light p-0.5">
          <Link
            href={viewHref("list")}
            role="tab"
            aria-selected={view === "list"}
            className={`${toggleBase} ${view === "list" ? activeToggle : inactiveToggle}`}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="h-4 w-4" aria-hidden>
              <path d="M7 5h10M7 10h10M7 15h10M3 5h.01M3 10h.01M3 15h.01" />
            </svg>
            List
          </Link>
          <Link
            href={viewHref("calendar")}
            role="tab"
            aria-selected={view === "calendar"}
            className={`${toggleBase} ${view === "calendar" ? activeToggle : inactiveToggle}`}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
              <path d="M3 8.5h14M7 2.8v3M13 2.8v3" />
            </svg>
            Calendar
          </Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Entries · ${MONTH_NAMES[month - 1]}`} value={entries.length} icon="calendar" />
        <StatCard label="In production" value={inProductionCount} icon="clock" />
        <StatCard label="Completed" value={completedCount} icon="check" />
        <StatCard label="Urgent" value={urgentCount} icon="alert" tone={urgentCount > 0 ? "danger" : "default"} attention />
      </div>

      {view === "calendar" ? (
        <section className="mt-6 rounded-2xl border border-gs-gray/10 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold tracking-tight">
              {MONTH_NAMES[month - 1]} <span className="font-normal text-gs-gray">| {year}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gs-gray">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-5 rounded bg-gs-red/10 ring-1 ring-gs-red/20" /> Regular post
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="flex h-3 w-5 items-center justify-center rounded bg-gs-red text-white">
                  <UrgentIcon className="h-2.5 w-2.5" />
                </span>
                Urgent task
              </span>
            </div>
          </div>
          <div className="mt-4">
            <CalendarGrid month={month} year={year} entries={calendarEntries} />
          </div>
          <p className="mt-3 text-xs text-gs-gray">
            Each entry shows its Content Type; open it for the topic and full details (or hover on desktop for a quick
            peek). Switch to List to edit the Monthly Brief or add entries.
          </p>
        </section>
      ) : (
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* Entries */}
          <section className="overflow-hidden rounded-2xl border border-gs-gray/10 bg-white shadow-sm">
            <h2 className="flex items-center gap-2.5 border-b border-gs-gray/10 px-5 py-4 font-heading text-base font-semibold tracking-tight">
              Entries
              <span className="rounded-full bg-gs-light px-2 py-0.5 text-xs font-semibold tabular-nums text-gs-gray">
                {entries.length}
              </span>
              <span className="ml-auto text-sm font-normal text-gs-gray">{monthLabel}</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-gs-gray/10 bg-gs-light/50 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray/80">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3">Publish date</th>
                    <th className="whitespace-nowrap px-4 py-3">Topic / Title</th>
                    <th className="whitespace-nowrap px-4 py-3">Content type</th>
                    <th className="whitespace-nowrap px-4 py-3">Team</th>
                    <th className="whitespace-nowrap px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center">
                        <p className="font-medium text-gs-black/80">No entries for {monthLabel} yet</p>
                        <p className="mt-1 text-sm text-gs-gray">
                          {canManage || canUrgent
                            ? "Add the first one from the panel on the right."
                            : "Entries the Social Media Lead adds will show up here."}
                        </p>
                      </td>
                    </tr>
                  )}
                  {entries.map((t) => (
                    <tr
                      key={t.id}
                      className={`border-t border-gs-gray/10 align-top transition-colors hover:bg-gs-light/50 ${
                        t.isUrgent ? "bg-gs-red/[0.07] shadow-[inset_3px_0_0_0_var(--color-gs-red)]" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <EditEntryDate
                          publishDateIso={t.publishDate!.toISOString().slice(0, 10)}
                          contentLeadTimeDays={t.contentType?.contentLeadTimeDays ?? 0}
                          editable={canManage && t.status !== "COMPLETED" && !t.isUrgent}
                          action={updateCalendarEntryDate.bind(null, projectId, t.id)}
                        />
                        <span className="mt-0.5 block text-xs text-gs-gray">
                          {t.publishDate!.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {t.isUrgent && <UrgentTag />}
                          <EditEntryTitle
                            title={t.name}
                            taskHref={`/projects/${projectId}/tasks/${t.id}`}
                            editable={t.status !== "COMPLETED" && !t.isUrgent}
                            action={updateCalendarEntryTitle.bind(null, projectId, t.id)}
                          />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gs-gray">
                        {t.contentType ? (
                          <span className="inline-flex rounded-full bg-gs-light px-2.5 py-0.5 text-xs font-medium text-gs-black/70">
                            {t.contentType.name}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="block font-medium text-gs-black/80">{t.group?.pod?.name ?? "—"}</span>
                        <span className="block text-xs text-gs-gray">{t.assignedTo?.name ?? "Unassigned"}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <TaskStatusChip status={t.status} label={statusLabel(t.status, "STANDARD")} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Side column: adding to the calendar comes first, then the month's brief */}
          <aside className="flex flex-col gap-6 xl:sticky xl:top-20">
            <EntryPanels
              entryForm={
                canManage ? (
                  <AddEntryForm
                    contentTypes={contentTypes.map((ct) => ({
                      id: ct.id,
                      name: ct.name,
                      contentLeadTimeDays: ct.contentLeadTimeDays,
                    }))}
                    action={createEntryWithId}
                  />
                ) : undefined
              }
              urgentForm={
                canUrgent ? (
                  <AddUrgentTaskForm
                    teams={urgentTeams}
                    contentTypes={contentTypes.map((ct) => ({ id: ct.id, name: ct.name }))}
                    action={createUrgentWithId}
                  />
                ) : undefined
              }
            />

            <section className="overflow-hidden rounded-2xl border border-gs-gray/10 bg-white shadow-sm">
              <h2 className="border-b border-gs-gray/10 px-5 py-4 font-heading text-base font-semibold tracking-tight">
                Monthly brief
                <span className="ml-2 text-sm font-normal text-gs-gray">{monthLabel}</span>
              </h2>
              <div className="px-5 py-4">
                <p className="mb-3 text-xs text-gs-gray">
                  Shown read-only on every task generated from this month&apos;s calendar.
                </p>
                {canManage ? (
                  <MonthlyBriefForm month={month} year={year} defaultText={monthlyBrief?.text ?? ""} action={upsertBriefWithId} />
                ) : monthlyBrief?.text ? (
                  <p className="whitespace-pre-wrap text-sm text-gs-black/80">{monthlyBrief.text}</p>
                ) : (
                  <p className="text-sm text-gs-gray">No brief set for this month yet.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
