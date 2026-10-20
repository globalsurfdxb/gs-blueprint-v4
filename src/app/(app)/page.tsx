import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDashboardData, type DashTask } from "@/lib/dashboard";
import { getLeadDashboardData, type LeadDashboardData } from "@/lib/lead-dashboard";
import { getSprintProgressData, type SprintProgressData } from "@/lib/sprint-dashboard";
import { canViewDashboard, isLead } from "@/lib/permissions";
import { formatDuration } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  IN_PROGRESS: "In Progress",
  REVIEW: "Review",
  REVISION: "Revision",
  COMPLETED: "Completed",
  ON_HOLD: "On Hold",
};

// Stroke icons for the KPI tiles (24px grid). Decorative — the label carries the meaning.
const TILE_ICONS = {
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5M12 16h.01" />
    </>
  ),
  revision: (
    <>
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 21v-5h5M3 12A9 9 0 0 1 18.5 5.8L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  hourglass: <path d="M6 3h12M6 21h12M7 3v4l5 5-5 5v4M17 3v4l-5 5 5 5v4" />,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2M9 2h6" />
    </>
  ),
} as const;

type TileIcon = keyof typeof TILE_ICONS;

function StatCard({
  label,
  value,
  tone = "default",
  href,
  icon,
  attention,
}: {
  label: string;
  value: number;
  tone?: "default" | "warn" | "danger";
  href?: string;
  icon?: TileIcon;
  /** Shows a short status caption under the number — for the "needs attention" tiles. */
  attention?: boolean;
}) {
  const valueColor = tone === "danger" ? "text-gs-red" : tone === "warn" ? "text-amber-600" : "text-gs-black";
  // Tone shows up as a tinted icon chip, a soft corner glow and a caption — only when the number
  // needs attention, so a calm dashboard stays calm.
  const chip =
    tone === "danger"
      ? "bg-gs-red text-white shadow-[0_4px_10px_-2px_rgba(230,62,49,0.55)]"
      : tone === "warn"
        ? "bg-amber-500 text-white shadow-[0_4px_10px_-2px_rgba(245,158,11,0.55)]"
        : "bg-gs-light text-gs-gray";
  const glow = tone === "danger" ? "bg-gs-red/15" : tone === "warn" ? "bg-amber-400/20" : "";
  const caption =
    tone === "danger" ? "Needs action" : tone === "warn" ? "Keep an eye on it" : attention ? "All clear" : null;
  const captionColor = tone === "danger" ? "text-gs-red" : tone === "warn" ? "text-amber-600" : "text-green-600";
  const body = (
    <>
      {glow && <span aria-hidden className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl ${glow}`} />}
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium leading-snug text-gs-gray">{label}</p>
        {icon && (
          <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${chip}`}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px]"
            >
              {TILE_ICONS[icon]}
            </svg>
          </span>
        )}
      </div>
      <p className={`relative mt-4 font-heading text-4xl font-bold tracking-tight tabular-nums ${valueColor}`}>{value}</p>
      {caption && <p className={`relative mt-1 text-xs font-medium ${captionColor}`}>{caption}</p>}
    </>
  );
  const cls = "relative block overflow-hidden rounded-xl border border-gs-gray/10 bg-white p-5 shadow-sm";
  return href ? (
    <Link href={href} className={`${cls} transition duration-150 hover:-translate-y-0.5 hover:shadow-md`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function TaskRows({ tasks, emptyText }: { tasks: DashTask[]; emptyText: string }) {
  if (tasks.length === 0) return <EmptyState text={emptyText} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
          <tr>
            <th className="whitespace-nowrap px-4 py-2">Task</th>
            <th className="whitespace-nowrap px-4 py-2">Project</th>
            <th className="whitespace-nowrap px-4 py-2">Assignee</th>
            <th className="whitespace-nowrap px-4 py-2">Due Date</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-t border-gs-gray/10">
              <td className="px-4 py-2.5">
                <Link href={`/projects/${t.projectId}/tasks/${t.id}`} className="font-medium hover:underline">
                  {t.name}
                </Link>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{t.projectName}</td>
              <td className="whitespace-nowrap px-4 py-2.5">
                {t.assigneeName ? (
                  <span className="text-gs-gray">{t.assigneeName}</span>
                ) : (
                  <span className="font-medium text-gs-red">Not Assigned</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">
                {t.dueDate}
                {t.daysLate !== null && t.daysLate > 0 && (
                  <span className="ml-1 text-gs-red">({t.daysLate} day{t.daysLate === 1 ? "" : "s"})</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Two-tone share bar: on-track (green) vs not-on-track (red). Empty rows render a quiet track. */
function ShareBar({ good, bad }: { good: number; bad: number }) {
  const total = good + bad;
  return (
    <span className="flex h-2 w-full min-w-12 overflow-hidden rounded-full bg-gs-gray/15" aria-hidden>
      {total > 0 && (
        <>
          <span className="h-full bg-green-500" style={{ width: `${(good / total) * 100}%` }} />
          <span className="h-full bg-gs-red" style={{ width: `${(bad / total) * 100}%` }} />
        </>
      )}
    </span>
  );
}

function SectionCard({
  title,
  count,
  className = "",
  children,
}: {
  title: string;
  /** Item count badge beside the title; red when > 0 so a non-empty problem list stands out. */
  count?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm ${className}`}>
      <h2 className="flex items-center gap-2 border-b border-gs-gray/10 px-4 py-3.5 text-[15px] font-semibold">
        {title}
        {count !== undefined && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
              count > 0 ? "bg-gs-red/10 text-gs-red" : "bg-gs-light text-gs-gray"
            }`}
          >
            {count}
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

/** Friendly empty state for a widget with nothing to show. */
function EmptyState({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 px-4 py-5 text-sm text-gs-gray">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="h-4 w-4 shrink-0 text-green-600"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12l3 3 5-6" />
      </svg>
      {text}
    </p>
  );
}

/** Time-of-day greeting in the viewer's own timezone (Dubai or India), plus a long date. */
function greetingFor(location: string): { greeting: string; dateLabel: string } {
  const timeZone = location === "INDIA" ? "Asia/Kolkata" : "Asia/Dubai";
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone }).format(now)) % 24;
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(now);
  return { greeting, dateLabel };
}

/**
 * Sprint Progress (PRD 8.14) — completion %, per-person workload (open tasks + hours logged),
 * and the reused 8.8 overdue/bottleneck flags, scoped to Sprint-enabled Task Groups. Rendered
 * only when the viewer has Sprint-enabled work in scope, so non-Dev dashboards are unchanged.
 */
function SprintProgressSection({ data }: { data: SprintProgressData }) {
  if (!data.inScope) return null;
  return (
    <div className="flex flex-col gap-8">
      <SectionCard title="Sprint Progress">
        {data.sprints.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gs-gray">No active or planned sprints in scope.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2">Sprint</th>
                  <th className="whitespace-nowrap px-4 py-2">Project</th>
                  <th className="whitespace-nowrap px-4 py-2">Status</th>
                  <th className="whitespace-nowrap px-4 py-2">Completion</th>
                  <th className="whitespace-nowrap px-4 py-2">Overdue</th>
                  <th className="whitespace-nowrap px-4 py-2">Stuck</th>
                </tr>
              </thead>
              <tbody>
                {data.sprints.map((s) => (
                  <tr key={s.id} className="border-t border-gs-gray/10">
                    <td className="px-4 py-2.5">
                      <Link href={`/projects/${s.projectId}`} className="font-medium hover:underline">{s.name}</Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{s.projectName}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className={s.status === "ACTIVE" ? "font-medium text-green-600" : "text-gs-gray"}>
                        {s.status === "ACTIVE" ? "Active" : "Planned"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-gs-gray/15" aria-hidden>
                          <span className="block h-full rounded-full bg-gs-black" style={{ width: `${s.completionPct}%` }} />
                        </span>
                        <span className="text-gs-gray">{s.completionPct}% ({s.completedTasks}/{s.totalTasks})</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={s.overdue > 0 ? "font-medium text-gs-red" : "text-gs-gray"}>{s.overdue}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={s.stuck > 0 ? "font-medium text-amber-600" : "text-gs-gray"}>{s.stuck}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Sprint Workload — Active Sprints">
        {data.workload.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gs-gray">No one has active-sprint work in scope.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2">Member</th>
                  <th className="whitespace-nowrap px-4 py-2">Open Tasks</th>
                  <th className="whitespace-nowrap px-4 py-2">Hours Logged</th>
                </tr>
              </thead>
              <tbody>
                {data.workload.map((m) => (
                  <tr key={m.userId} className="border-t border-gs-gray/10">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium">{m.name}</td>
                    <td className="px-4 py-2.5 text-gs-gray">{m.openTasks}</td>
                    <td className="px-4 py-2.5 text-gs-gray">{formatDuration(m.loggedSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function LeadDashboard({ data, sprintProgress }: { data: LeadDashboardData; sprintProgress: SprintProgressData }) {
  if (!data.hasGroups) {
    return (
      <div className="page-md">
        <PageHeader
          title="My Team"
        />
        <p className="mt-6 text-sm text-gs-gray">
          You don&apos;t lead a Task Group on any project yet — once you&apos;re attached as a discipline Lead,
          your team&apos;s work rolls up here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="My Team"
        actions={<>
          <span className="text-sm text-gs-gray">Across every group you lead</span>
        </>}
      />

      {/* KPI row — the "what needs me" glance. Review/unassigned link into My Reviews, the
          Lead's action queue, rather than duplicating that list here. */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Awaiting My Review" value={data.reviewCount} tone={data.reviewCount > 0 ? "warn" : "default"} href="/my-reviews" />
        <StatCard label="Unassigned" value={data.unassignedCount} tone={data.unassignedCount > 0 ? "danger" : "default"} href="/my-reviews" />
        <StatCard label="Overdue" value={data.overdueTasks.length} tone={data.overdueTasks.length > 0 ? "danger" : "default"} />
        <StatCard label="Revision-Flagged" value={data.flaggedCount} tone={data.flaggedCount > 0 ? "danger" : "default"} />
      </div>

      <div className="mt-8 flex flex-col gap-8">
        <SectionCard title="Team Workload">
          {data.team.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gs-gray">No team members found for your pod.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2">Member</th>
                    <th className="whitespace-nowrap px-4 py-2">Open</th>
                    <th className="whitespace-nowrap px-4 py-2">In Progress</th>
                    <th className="whitespace-nowrap px-4 py-2">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.team.map((m) => (
                    <tr key={m.id} className="border-t border-gs-gray/10">
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium">{m.name}</td>
                      <td className="px-4 py-2.5 text-gs-gray">{m.open}</td>
                      <td className="px-4 py-2.5 text-gs-gray">{m.inProgress}</td>
                      <td className="px-4 py-2.5">
                        <span className={m.overdue > 0 ? "font-medium text-gs-red" : "text-gs-gray"}>{m.overdue}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Overdue Tasks">
          <TaskRows tasks={data.overdueTasks} emptyText="Nothing overdue in your groups." />
        </SectionCard>

        <SectionCard title="Tasks With Revisions">
          {data.revisionTasks.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gs-gray">No tasks in revision.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2">Task</th>
                    <th className="whitespace-nowrap px-4 py-2">Project</th>
                    <th className="whitespace-nowrap px-4 py-2">Assignee</th>
                    <th className="whitespace-nowrap px-4 py-2">Status</th>
                    <th className="whitespace-nowrap px-4 py-2">Revisions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.revisionTasks.map((t) => (
                    <tr key={t.id} className="border-t border-gs-gray/10">
                      <td className="px-4 py-2.5">
                        <Link href={`/projects/${t.projectId}/tasks/${t.id}`} className="font-medium hover:underline">
                          {t.name}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{t.projectName}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{t.assigneeName ?? "Unassigned"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{STATUS_LABELS[t.status] ?? t.status}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex min-w-6 justify-center rounded px-1.5 py-0.5 text-xs font-semibold ${
                            t.revisionCount >= 2 ? "bg-gs-red/10 text-gs-red" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {t.revisionCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Bottlenecks — Stuck 3+ Days">
          <TaskRows tasks={data.bottlenecks} emptyText="Nothing stuck in progress or review." />
        </SectionCard>

        <SprintProgressSection data={sprintProgress} />
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Admin + Cluster Head get the oversight dashboard (PRD 8.8); a Lead gets their own
  // "My Team" roll-up; everyone else lands on their own task list, their real home.
  if (!canViewDashboard(user)) {
    if (isLead(user)) {
      const [leadData, sprintProgress] = await Promise.all([
        getLeadDashboardData(user),
        getSprintProgressData(user),
      ]);
      return <LeadDashboard data={leadData} sprintProgress={sprintProgress} />;
    }
    // A view-only Dependency Tracker (PRD 8.13) has no task list of their own — their home is
    // the dependency queue. Only redirect there if they actually hold a designation.
    const trackerCount = await prisma.project.count({ where: { dependencyTrackerId: user.id, archivedAt: null } });
    redirect(trackerCount > 0 ? "/dependencies" : "/my-tasks");
  }

  const [data, sprintProgress] = await Promise.all([getDashboardData(user), getSprintProgressData(user)]);

  const { greeting, dateLabel } = greetingFor(user.location);
  const firstName = user.name.split(" ")[0];
  // Due Today / Running Timers only render when non-empty; the on-track card spans the full row
  // when it has no neighbour so the grid never leaves a hole.
  const hasSideCards = data.dueTodayTasks.length > 0 || data.runningTimers.length > 0;

  const overdueN = data.overdueTasks.length;
  const dueTodayN = data.dueTodayTasks.length;
  const allClear = overdueN === 0 && dueTodayN === 0;

  return (
    <div>
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1d1e24] via-[#23252c] to-[#2e1c1f] p-6 text-white shadow-lg md:p-8">
        {/* Brand glow + faint grid — decorative only. */}
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-gs-red/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/3 h-72 w-72 rounded-full bg-[#ff7a59]/10 blur-3xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:36px_36px] [mask-image:linear-gradient(to_bottom_right,black,transparent_70%)]"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
          <div>
            <p className="text-sm font-medium text-white/60">{dateLabel}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
              {greeting}, {firstName}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {allClear ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm ring-1 ring-white/15">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-green-400" />
                  All clear — nothing overdue or due today
                </span>
              ) : (
                <>
                  {overdueN > 0 && (
                    <span className="inline-flex items-center gap-2 rounded-full bg-gs-red/20 px-3 py-1 text-sm ring-1 ring-gs-red/40">
                      <span aria-hidden className="h-2 w-2 rounded-full bg-gs-red" />
                      {overdueN} overdue {overdueN === 1 ? "task" : "tasks"}
                    </span>
                  )}
                  {dueTodayN > 0 && (
                    <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/15 px-3 py-1 text-sm ring-1 ring-amber-300/30">
                      <span aria-hidden className="h-2 w-2 rounded-full bg-amber-400" />
                      {dueTodayN} due today
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 ring-1 ring-white/15">
              {data.scopeLabel}
            </span>
            <Link href="/projects" className="btn bg-white text-gs-black shadow-sm hover:bg-white/90">
              View projects
            </Link>
          </div>
        </div>
      </section>

      {/* Glanceable KPI groups — big Space Grotesk numbers, the "what needs attention" summary
          a Cluster Head or Admin pulls up between meetings (PRD 8.8, 9.4). On wide screens the two
          groups sit side by side (5 + 4 tiles) so the whole picture is one row. */}
      <div className="mt-8 grid gap-x-8 gap-y-8 2xl:grid-cols-9">
        <section className="2xl:col-span-5">
          <h2 className="text-sm font-semibold text-gs-black">Needs attention</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <StatCard icon="alert" attention label="Overdue Tasks" value={data.overdueTasks.length} tone={data.overdueTasks.length > 0 ? "danger" : "default"} />
            <StatCard icon="revision" attention label="With Revisions" value={data.revisionTasks.length} tone={data.revisionTasks.length > 0 ? "warn" : "default"} />
            <StatCard icon="clock" attention label="Hours at Risk" value={data.hoursRisk.length} tone={data.hoursRisk.length > 0 ? "warn" : "default"} />
            <StatCard icon="hourglass" attention label="Bottlenecked" value={data.bottlenecks.length} tone={data.bottlenecks.length > 0 ? "warn" : "default"} />
            <StatCard icon="flag" attention label="Not On Track" value={data.projectsNotOnTrack} tone={data.projectsNotOnTrack > 0 ? "danger" : "default"} />
          </div>
        </section>

        {/* Activity summary widgets (PRD 8.8) — scoped identically to the KPIs beside them. */}
        <section className="2xl:col-span-4">
          <h2 className="text-sm font-semibold text-gs-black">Activity</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon="list" label="Active Tasks" value={data.activeCount} />
            <StatCard icon="check" label="Completed Tasks" value={data.completedCount} />
            <StatCard icon="calendar" label="Due Today" value={data.dueTodayTasks.length} tone={data.dueTodayTasks.length > 0 ? "warn" : "default"} />
            <StatCard icon="timer" label="Running Timers" value={data.runningTimers.length} tone={data.runningTimers.length > 0 ? "warn" : "default"} />
          </div>
        </section>
      </div>

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-2">
        {/* On-track rollup — cluster-by-cluster for Admin, pod-by-pod for a Cluster Head. */}
        <SectionCard
          title={`On Track vs. Not — by ${data.onTrackGrouping}`}
          className={hasSideCards ? "" : "xl:col-span-2"}
        >
          {data.onTrack.length === 0 ? (
            <EmptyState text="No active projects in scope." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[300px] text-sm">
                <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2 capitalize">{data.onTrackGrouping}</th>
                    <th className="whitespace-nowrap px-4 py-2">On Track</th>
                    <th className="whitespace-nowrap px-4 py-2">Not On Track</th>
                    <th className="px-4 py-2"><span className="sr-only">Share on track</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.onTrack.map((r) => (
                    <tr key={r.label} className="border-t border-gs-gray/10">
                      <td className="px-4 py-2.5 font-medium">{r.label}</td>
                      <td className="px-4 py-2.5 text-gs-gray">{r.onTrack}</td>
                      <td className="px-4 py-2.5">
                        <span className={r.notOnTrack > 0 ? "font-medium text-gs-red" : "text-gs-gray"}>{r.notOnTrack}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <ShareBar good={r.onTrack} bad={r.notOnTrack} />
                      </td>
                    </tr>
                  ))}
                  {/* Distinct-project total only for the cluster view — pod rows overlap
                      (a multi-pod project counts under each pod), so summing them would
                      over-count. The KPI card above carries the honest distinct figure. */}
                  {data.onTrackGrouping === "cluster" ? (
                    <tr className="border-t border-gs-gray/15 bg-gs-light/50">
                      <td className="px-4 py-2.5 text-xs font-semibold uppercase text-gs-gray">Total</td>
                      <td className="px-4 py-2.5 font-medium">{data.projectsOnTrack}</td>
                      <td className="px-4 py-2.5 font-medium text-gs-red">{data.projectsNotOnTrack}</td>
                      <td className="px-4 py-2.5">
                        <ShareBar good={data.projectsOnTrack} bad={data.projectsNotOnTrack} />
                      </td>
                    </tr>
                  ) : (
                    <tr className="border-t border-gs-gray/15 bg-gs-light/50">
                      <td colSpan={4} className="px-4 py-2 text-xs text-gs-gray">
                        {data.projectsNotOnTrack} of {data.projectsOnTrack + data.projectsNotOnTrack}{" "}
                        {data.projectsOnTrack + data.projectsNotOnTrack === 1 ? "project" : "projects"} not on track. A
                        project spanning two pods appears in both rows above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {data.dueTodayTasks.length > 0 && (
          <SectionCard title="Due Today" count={data.dueTodayTasks.length}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-sm">
                <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2">Task</th>
                    <th className="whitespace-nowrap px-4 py-2">Assignee</th>
                    <th className="whitespace-nowrap px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dueTodayTasks.map((t) => (
                    <tr key={t.id} className="border-t border-gs-gray/10">
                      <td className="px-4 py-2.5">
                        <Link href={`/projects/${t.projectId}/tasks/${t.id}`} className="font-medium hover:underline">
                          {t.name}
                        </Link>
                        <p className="text-xs text-gs-gray">{t.projectName}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{t.assigneeName ?? "Unassigned"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{STATUS_LABELS[t.status] ?? t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {data.runningTimers.length > 0 && (
          <SectionCard title="Running Timers" count={data.runningTimers.length}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-sm">
                <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2">Task</th>
                    <th className="whitespace-nowrap px-4 py-2">Running for</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runningTimers.map((r) => (
                    <tr key={r.taskId} className="border-t border-gs-gray/10">
                      <td className="px-4 py-2.5">
                        <Link href={`/projects/${r.projectId}/tasks/${r.taskId}`} className="font-medium hover:underline">
                          {r.taskName}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{r.userName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        <SectionCard title="Overdue Tasks" count={data.overdueTasks.length} className="xl:col-span-2">
          <TaskRows tasks={data.overdueTasks} emptyText="Nothing overdue in scope." />
        </SectionCard>

        {/* Revision-count highlighting: 1 = amber (normal), 2+ = red (flagged) per PRD 8.8. */}
        <SectionCard title="Tasks With Revisions" count={data.revisionTasks.length} className="xl:col-span-2">
          {data.revisionTasks.length === 0 ? (
            <EmptyState text="No tasks in revision." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2">Task</th>
                    <th className="whitespace-nowrap px-4 py-2">Project</th>
                    <th className="whitespace-nowrap px-4 py-2">Assignee</th>
                    <th className="whitespace-nowrap px-4 py-2">Status</th>
                    <th className="whitespace-nowrap px-4 py-2">Revisions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.revisionTasks.map((t) => (
                    <tr key={t.id} className="border-t border-gs-gray/10">
                      <td className="px-4 py-2.5">
                        <Link href={`/projects/${t.projectId}/tasks/${t.id}`} className="font-medium hover:underline">
                          {t.name}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{t.projectName}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{t.assigneeName ?? "Unassigned"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{STATUS_LABELS[t.status] ?? t.status}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex min-w-6 justify-center rounded px-1.5 py-0.5 text-xs font-semibold ${
                            t.revisionCount >= 2 ? "bg-gs-red/10 text-gs-red" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {t.revisionCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Projects Approaching / Over Max Hours" count={data.hoursRisk.length} className="xl:col-span-2">
          {data.hoursRisk.length === 0 ? (
            <EmptyState text="No projects near their hours cap." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2">Project</th>
                    <th className="whitespace-nowrap px-4 py-2">Client</th>
                    <th className="whitespace-nowrap px-4 py-2">Logged / Max</th>
                    <th className="whitespace-nowrap px-4 py-2">Used</th>
                  </tr>
                </thead>
                <tbody>
                  {data.hoursRisk.map((p) => (
                    <tr key={p.projectId} className="border-t border-gs-gray/10">
                      <td className="px-4 py-2.5">
                        <Link href={`/projects/${p.projectId}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{p.clientName}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">
                        {formatDuration(Math.round(p.loggedHours * 3600))} / {p.maxHours}h
                        {p.allocationType === "MONTHLY" ? "/mo" : ""}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`font-medium ${p.pct > 1 ? "text-gs-red" : "text-amber-600"}`}>
                          {Math.round(p.pct * 100)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Bottlenecks — Stuck 3+ Days" count={data.bottlenecks.length} className="xl:col-span-2">
          <TaskRows tasks={data.bottlenecks} emptyText="Nothing stuck in progress or review." />
        </SectionCard>

        <div className="xl:col-span-2">
          <SprintProgressSection data={sprintProgress} />
        </div>
      </div>
    </div>
  );
}
