import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDashboardData, type DashTask } from "@/lib/dashboard";
import { getLeadDashboardData, type LeadDashboardData } from "@/lib/lead-dashboard";
import { getSprintProgressData, type SprintProgressData } from "@/lib/sprint-dashboard";
import { canViewDashboard, hasPersonalTaskList, isLead } from "@/lib/permissions";
import { formatDuration } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { statusLabel } from "@/lib/bug";
import { getBugDashboardData, type BugDashboardData } from "@/lib/bug-dashboard";
import { BugDashboardSection } from "@/components/bug-dashboard";
import { DashboardHero, EmptyState, HeroPill, ProjectLabel, SectionCard, StatCard } from "@/components/dashboard-ui";



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
              <td className="whitespace-nowrap px-4 py-2.5">
                <ProjectLabel name={t.projectName} client={t.clientName} />
              </td>
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
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <ProjectLabel name={s.projectName} client={s.clientName} />
                    </td>
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

function LeadDashboard({
  data,
  sprintProgress,
  bugData,
  user,
}: {
  data: LeadDashboardData;
  sprintProgress: SprintProgressData;
  bugData: BugDashboardData;
  user: { name: string; location: string };
}) {
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

  const overdueN = data.overdueTasks.length;
  const needsAction = data.reviewCount + data.unassignedCount + overdueN + data.flaggedCount;

  return (
    <div>
      <DashboardHero
        location={user.location}
        name={user.name}
        scopeLabel="Across every group you lead"
        action={{ href: "/my-reviews", label: "Open My Reviews" }}
        pills={
          needsAction === 0 ? (
            <HeroPill tone="ok">All clear — nothing waiting on you</HeroPill>
          ) : (
            <>
              {data.reviewCount > 0 && <HeroPill tone="warn">{data.reviewCount} awaiting your review</HeroPill>}
              {data.unassignedCount > 0 && <HeroPill tone="danger">{data.unassignedCount} unassigned</HeroPill>}
              {overdueN > 0 && (
                <HeroPill tone="danger">
                  {overdueN} overdue {overdueN === 1 ? "task" : "tasks"}
                </HeroPill>
              )}
              {data.flaggedCount > 0 && <HeroPill tone="warn">{data.flaggedCount} revision-flagged</HeroPill>}
            </>
          )
        }
      />

      {/* KPI row — the "what needs me" glance. Each tile opens the matching filtered list in My
          Reviews rather than duplicating that list here. */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-gs-black">Needs attention</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon="clock" attention label="Awaiting My Review" value={data.reviewCount} tone={data.reviewCount > 0 ? "warn" : "default"} href="/my-reviews" />
          <StatCard icon="list" attention label="Unassigned" value={data.unassignedCount} tone={data.unassignedCount > 0 ? "danger" : "default"} href="/my-reviews?view=unassigned" />
          <StatCard icon="alert" attention label="Overdue" value={overdueN} tone={overdueN > 0 ? "danger" : "default"} href="/my-reviews?view=overdue" />
          <StatCard icon="revision" attention label="Revision-Flagged" value={data.flaggedCount} tone={data.flaggedCount > 0 ? "danger" : "default"} href="/my-reviews?view=flagged" />
        </div>
      </section>

      {sprintProgress.inScope && (
        <div className="mt-8">
          <SprintProgressSection data={sprintProgress} />
        </div>
      )}

      <BugDashboardSection data={bugData} />

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-2">
        <SectionCard title="Team Workload" count={data.team.length} className="xl:col-span-2">
          {data.team.length === 0 ? (
            <EmptyState text="No team members found for your pod." />
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

        <SectionCard title="Overdue Tasks" count={overdueN} className="xl:col-span-2">
          <TaskRows tasks={data.overdueTasks} emptyText="Nothing overdue in your groups." />
        </SectionCard>

        {/* Revision-count highlighting: 1 = amber (normal), 2+ = red (flagged), same as the admin view. */}
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
                      <td className="whitespace-nowrap px-4 py-2.5">
                <ProjectLabel name={t.projectName} client={t.clientName} />
              </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{t.assigneeName ?? "Unassigned"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{statusLabel(t.status, t.taskType)}</td>
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

        <SectionCard title="Bottlenecks — Stuck 3+ Days" count={data.bottlenecks.length} className="xl:col-span-2">
          <TaskRows tasks={data.bottlenecks} emptyText="Nothing stuck in progress or review." />
        </SectionCard>
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
      const [leadData, sprintProgress, bugData] = await Promise.all([
        getLeadDashboardData(user),
        getSprintProgressData(user),
        getBugDashboardData(user),
      ]);
      return <LeadDashboard data={leadData} sprintProgress={sprintProgress} bugData={bugData} user={user} />;
    }
    // A view-only Dependency Tracker (PRD 8.13) has no task list of their own — their home is
    // the dependency queue. Only redirect there if they actually hold a designation.
    const trackerCount = await prisma.project.count({ where: { dependencyTrackerId: user.id, archivedAt: null } });
    // An Account Manager (cluster-scoped Account/Client Services) has no personal task list — their
    // home is the project list.
    redirect(trackerCount > 0 ? "/dependencies" : hasPersonalTaskList(user) ? "/my-tasks" : "/projects");
  }

  const [data, sprintProgress, bugData] = await Promise.all([
    getDashboardData(user),
    getSprintProgressData(user),
    getBugDashboardData(user),
  ]);

  // Due Today / Running Timers only render when non-empty; the on-track card spans the full row
  // when it has no neighbour so the grid never leaves a hole.
  const hasSideCards = data.dueTodayTasks.length > 0 || data.runningTimers.length > 0;

  const overdueN = data.overdueTasks.length;
  const dueTodayN = data.dueTodayTasks.length;
  const allClear = overdueN === 0 && dueTodayN === 0;

  return (
    <div>
      <DashboardHero
        location={user.location}
        name={user.name}
        scopeLabel={data.scopeLabel}
        action={{ href: "/projects", label: "View projects" }}
        pills={
          allClear ? (
            <HeroPill tone="ok">All clear — nothing overdue or due today</HeroPill>
          ) : (
            <>
              {overdueN > 0 && <HeroPill tone="danger">{overdueN} overdue {overdueN === 1 ? "task" : "tasks"}</HeroPill>}
              {dueTodayN > 0 && <HeroPill tone="warn">{dueTodayN} due today</HeroPill>}
            </>
          )
        }
      />

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

      {sprintProgress.inScope && (
        <div className="mt-8">
          <SprintProgressSection data={sprintProgress} />
        </div>
      )}

      <BugDashboardSection data={bugData} />

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
                        <p className="text-xs text-gs-gray">
                          {t.projectName} · {t.clientName}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{t.assigneeName ?? "Unassigned"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{statusLabel(t.status, t.taskType)}</td>
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
                      <td className="whitespace-nowrap px-4 py-2.5">
                <ProjectLabel name={t.projectName} client={t.clientName} />
              </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{t.assigneeName ?? "Unassigned"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gs-gray">{statusLabel(t.status, t.taskType)}</td>
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
      </div>
    </div>
  );
}
