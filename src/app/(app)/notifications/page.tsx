import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions/notifications";
import { RESOLVED_REMINDER } from "@/lib/notification-scope";
import { formatDateTime } from "@/lib/format";
import { addDays, getLocalDateString } from "@/lib/timezone";
import { TILE_ICONS, type TileIcon } from "@/components/dashboard-ui";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";

// Icon + tint per notification type, so the list can be scanned by what happened rather than read line by line.
const TYPE_STYLE: Record<string, { icon: TileIcon | "comment" | "people"; chip: string }> = {
  TASK_ASSIGNED: { icon: "list", chip: "bg-sky-50 text-sky-600" },
  DUE_TOMORROW: { icon: "clock", chip: "bg-amber-50 text-amber-600" },
  OVERDUE: { icon: "alert", chip: "bg-gs-red/10 text-gs-red" },
  MOVED_TO_REVISION: { icon: "revision", chip: "bg-amber-50 text-amber-600" },
  COMPLETED: { icon: "check", chip: "bg-green-50 text-green-600" },
  COMMENT_ADDED: { icon: "comment", chip: "bg-violet-50 text-violet-600" },
  SUBMITTED_FOR_REVIEW: { icon: "flag", chip: "bg-violet-50 text-violet-600" },
  PROJECT_ASSIGNED: { icon: "people", chip: "bg-sky-50 text-sky-600" },
  TASK_HANDOFF_RECEIVED: { icon: "hourglass", chip: "bg-sky-50 text-sky-600" },
};
const EXTRA_ICONS = {
  comment: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.4c2.2.7 3.5 2.5 3.5 5.6" />
    </>
  ),
};

/**
 * Notifications, split in two so the ones that matter to me come first: "My notifications" (my own work and
 * anything not tied to a teammate's task) and "Team updates" (activity on tasks assigned to other people —
 * still one click away). Reminders for tasks that have since been completed are dropped.
 */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { view: viewParam } = await searchParams;
  const view: "mine" | "team" = viewParam === "team" ? "team" : "mine";

  const all = await prisma.notification.findMany({
    where: { userId: user.id, NOT: RESOLVED_REMINDER },
    include: { relatedTask: { select: { projectId: true, assignedToId: true, assignedTo: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Name the project on every notification: its own project id, or the one its task belongs to.
  const projectIdOf = (n: (typeof all)[number]) => n.relatedProjectId ?? n.relatedTask?.projectId ?? null;
  const projectIds = Array.from(new Set(all.map(projectIdOf).filter((id): id is string => !!id)));
  const projects = projectIds.length
    ? await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, name: true, client: { select: { name: true } } },
      })
    : [];
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const isTeam = (n: (typeof all)[number]) => !!n.relatedTask?.assignedToId && n.relatedTask.assignedToId !== user.id;
  const mine = all.filter((n) => !isTeam(n));
  const team = all.filter(isTeam);
  const shown = view === "team" ? team : mine;
  const unread = (list: typeof all) => list.filter((n) => !n.isRead).length;
  const markAllWithScope = markAllNotificationsRead.bind(null, view);

  const tabs = [
    { key: "mine" as const, label: "My notifications", unread: unread(mine) },
    { key: "team" as const, label: "Team updates", unread: unread(team) },
  ];

  // Group by calendar day in the viewer's own timezone: Today, Yesterday, then the date.
  const todayKey = getLocalDateString(user.location, new Date());
  const yesterdayKey = addDays(todayKey, -1);
  const dayLabel = (key: string) =>
    key === todayKey
      ? "Today"
      : key === yesterdayKey
        ? "Yesterday"
        : new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          });
  const days: { key: string; items: typeof shown }[] = [];
  for (const n of shown) {
    const key = getLocalDateString(user.location, n.createdAt);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(n);
    else days.push({ key, items: [n] });
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Updates on your own tasks come first. Activity on teammates' tasks is under Team updates."
        actions={
          unread(shown) > 0 ? (
            <ActionForm action={markAllWithScope}>
              <button type="submit" className="btn btn-secondary">
                Mark all as read
              </button>
            </ActionForm>
          ) : undefined
        }
      />

      <section className="mt-6 overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm">
        <nav aria-label="Notification groups" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-gs-gray/10 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => {
            const active = t.key === view;
            return (
              <Link
                key={t.key}
                href={t.key === "mine" ? "/notifications" : "/notifications?view=team"}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors ${
                  active ? "border-gs-red text-gs-black" : "border-transparent text-gs-gray hover:text-gs-black"
                }`}
              >
                {t.label}
                {t.unread > 0 && (
                  <span className="rounded-full bg-gs-red px-2 py-0.5 text-xs font-semibold tabular-nums text-white">{t.unread}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-gs-light text-gs-gray">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
            </span>
            <p className="font-medium">{view === "team" ? "No team updates" : "You're all caught up"}</p>
            <p className="text-sm text-gs-gray">
              {view === "team" ? "Activity on your teammates' tasks will show up here." : "New updates on your work will show up here."}
            </p>
          </div>
        ) : (
          days.map((day) => (
            <div key={day.key}>
              <h2 className="border-b border-gs-gray/10 bg-gs-light/60 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                {dayLabel(day.key)}
              </h2>
              <ul className="divide-y divide-gs-gray/10">
                {day.items.map((n) => {
                  const markReadWithId = markNotificationRead.bind(null, n.id);
                  const assignee = n.relatedTask?.assignedTo?.name;
                  const pid = projectIdOf(n);
                  const project = pid ? projectById.get(pid) : undefined;
                  const style = TYPE_STYLE[n.type] ?? { icon: "list" as const, chip: "bg-gs-light text-gs-gray" };
                  const iconPaths = style.icon === "comment" || style.icon === "people" ? EXTRA_ICONS[style.icon] : TILE_ICONS[style.icon];
                  const href = n.relatedProjectId && n.relatedTaskId ? `/projects/${n.relatedProjectId}/tasks/${n.relatedTaskId}` : n.relatedProjectId ? `/projects/${n.relatedProjectId}` : null;

                  const content = (
                    <div className="flex min-w-0 flex-1 items-start gap-3.5">
                      <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.chip}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                          {iconPaths}
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        {project && (
                          <p className="mb-0.5 truncate text-xs font-semibold text-gs-gray">
                            <span className="text-gs-black/70">{project.name}</span>
                            <span className="font-normal"> · {project.client.name}</span>
                          </p>
                        )}
                        <p className={`text-sm leading-snug ${n.isRead ? "text-gs-black/75" : "font-medium text-gs-black"}`}>{n.message}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gs-gray">
                          <span>{formatDateTime(n.createdAt)}</span>
                          {view === "team" && assignee && (
                            <span className="rounded-full bg-gs-light px-2 py-0.5 font-medium">Assigned to {assignee}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  );

                  return (
                    <li key={n.id} className={`flex items-center gap-3 px-5 py-4 transition-colors ${n.isRead ? "" : "bg-gs-red/[0.04]"}`}>
                      {href ? (
                        <Link href={href} className="flex min-w-0 flex-1 rounded-md hover:opacity-80">
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                      {!n.isRead && (
                        <div className="flex shrink-0 items-center gap-3">
                          <span aria-label="Unread" className="h-2 w-2 rounded-full bg-gs-red" />
                          <ActionForm action={markReadWithId}>
                            <button type="submit" className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gs-gray hover:bg-gs-light hover:text-gs-black">
                              Mark read
                            </button>
                          </ActionForm>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
