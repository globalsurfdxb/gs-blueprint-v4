import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions/notifications";
import { RESOLVED_REMINDER } from "@/lib/notification-scope";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";

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
    include: { relatedTask: { select: { assignedToId: true, assignedTo: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

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

  return (
    <div className="page-md">
      <PageHeader
        title="Notifications"
        description="Updates on your own tasks come first. Activity on teammates' tasks is under Team updates."
        actions={
          unread(shown) > 0 ? (
            <ActionForm action={markAllWithScope}>
              <button type="submit" className="flex min-h-11 items-center text-sm font-medium text-gs-red hover:underline">
                Mark all as read
              </button>
            </ActionForm>
          ) : undefined
        }
      />

      <nav aria-label="Notification groups" className="mt-5 flex gap-1 border-b border-gs-gray/20">
        {tabs.map((t) => {
          const active = t.key === view;
          return (
            <Link
              key={t.key}
              href={t.key === "mine" ? "/notifications" : "/notifications?view=team"}
              aria-current={active ? "page" : undefined}
              className={`-mb-px flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors ${
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

      <div className="mt-5 flex flex-col gap-2">
        {shown.length === 0 && (
          <p className="text-sm text-gs-gray">
            {view === "team" ? "No team updates." : "No notifications yet."}
          </p>
        )}
        {shown.map((n) => {
          const markReadWithId = markNotificationRead.bind(null, n.id);
          const assignee = n.relatedTask?.assignedTo?.name;
          const content = (
            <>
              <p className={n.isRead ? "text-gs-black" : "font-medium text-gs-black"}>{n.message}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gs-gray">
                <span>{formatDateTime(n.createdAt)}</span>
                {view === "team" && assignee && (
                  <span className="rounded-full bg-gs-light px-2 py-0.5 font-medium">Assigned to {assignee}</span>
                )}
              </p>
            </>
          );

          return (
            <div
              key={n.id}
              className={`flex items-center justify-between rounded-md border p-4 text-sm ${
                n.isRead ? "border-gs-gray/15 bg-white" : "border-gs-red/30 bg-gs-red/5"
              }`}
            >
              <div className="flex-1">
                {n.relatedProjectId && n.relatedTaskId ? (
                  <Link href={`/projects/${n.relatedProjectId}/tasks/${n.relatedTaskId}`} className="hover:underline">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </div>
              {!n.isRead && (
                <ActionForm action={markReadWithId}>
                  <button
                    type="submit"
                    className="ml-3 flex min-h-11 shrink-0 items-center text-xs text-gs-gray hover:text-gs-black"
                  >
                    Mark read
                  </button>
                </ActionForm>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
