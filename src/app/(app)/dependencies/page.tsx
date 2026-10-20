import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocalDateString } from "@/lib/timezone";
import { dueRange, loadActiveTrackerRows, deriveTrackerStats } from "@/lib/dependency-data";
import { DashboardHero, EmptyState, HeroPill, SectionCard, StatCard } from "@/components/dashboard-ui";

/**
 * Dependency Tracker Dashboard (PRD 8.13, v1.28) — the coordinator's landing screen on login.
 * Deliberately clean: just the at-a-glance figures, no filter form and no task list. Every tile
 * deep-links into the Dependency Tracker list (or the Projects tab) with the matching filter
 * pre-applied. All figures are computed from the coordinator's full visible universe — every
 * non-completed cross-department task on their tracked projects (department-membership rule).
 * Styled like the Admin dashboard: greeting banner, icon KPI tiles, section cards.
 */
export default async function DependencyDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const now = new Date();
  const todayStr = getLocalDateString(user.location, now);
  const weekRange = dueRange("week", undefined, undefined, todayStr);

  const [projectCount, rows] = await Promise.all([
    prisma.project.count({ where: { dependencyTrackerId: user.id, archivedAt: null } }),
    loadActiveTrackerRows(user.id, user.location, now),
  ]);

  const stats = deriveTrackerStats(rows, weekRange);
  const attention = stats.overdue + stats.stuck;

  return (
    <div>
      <DashboardHero
        location={user.location}
        name={user.name}
        scopeLabel={`${projectCount} ${projectCount === 1 ? "project" : "projects"} tracked`}
        action={{ href: "/dependencies/tracker", label: "Open Dependency Tracker" }}
        pills={
          attention === 0 ? (
            <HeroPill tone="ok">All clear — nothing overdue or stuck</HeroPill>
          ) : (
            <>
              {stats.overdue > 0 && (
                <HeroPill tone="danger">
                  {stats.overdue} overdue {stats.overdue === 1 ? "task" : "tasks"}
                </HeroPill>
              )}
              {stats.stuck > 0 && <HeroPill tone="warn">{stats.stuck} stuck</HeroPill>}
            </>
          )
        }
      />

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-gs-black">Needs attention</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon="alert"
            attention
            label="Overdue"
            value={stats.overdue}
            tone={stats.overdue > 0 ? "danger" : "default"}
            href="/dependencies/tracker?overdue=1"
          />
          <StatCard
            icon="hourglass"
            attention
            label="Stuck"
            value={stats.stuck}
            tone={stats.stuck > 0 ? "warn" : "default"}
            href="/dependencies/tracker?stuck=1"
          />
          <StatCard icon="calendar" label="Due This Week" value={stats.dueThisWeek} href="/dependencies/tracker?due=week" />
          <StatCard icon="list" label="Projects Tracked" value={projectCount} href="/dependencies/projects" />
        </div>
      </section>

      <div className="mt-8">
        <SectionCard title="By Discipline" count={stats.byDiscipline.length}>
          {stats.byDiscipline.length === 0 ? (
            <EmptyState text="No open cross-department tasks on your tracked projects." />
          ) : (
            <ul>
              {stats.byDiscipline.map((d) => (
                <li key={d.discipline} className="border-t border-gs-gray/10 first:border-t-0">
                  <Link
                    href={`/dependencies/tracker?discipline=${encodeURIComponent(d.discipline)}`}
                    className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-gs-light/60"
                  >
                    <span className="font-medium">{d.discipline}</span>
                    <span className="rounded-full bg-gs-light px-2.5 py-0.5 text-xs font-semibold tabular-nums text-gs-gray">
                      {d.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
