import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import type { CurrentUser } from "@/lib/auth";
import {
  canViewProject,
  canManageTaskGroups,
  canAttachLeadRole,
  canManageThisGroup,
  canEditProjectInCluster,
  canViewMaxAllocatedHours,
  canViewAllProjectGroups,
  canOverseeGroup,
  canCreateTaskInGroup,
  canViewGroupTimeRollup,
  canViewProjectTimeRollup,
  canAssignAccountManager,
  canAssignDependencyTracker,
  canManageSprints,
  canManageBugSprints,
  canAssignAnyoneInGroup,
  canAssignBugToBugSprint,
  canSetTeamCapacity,
  canManageMilestones,
  getEligibleAccountManagers,
  getEligibleDependencyTrackers,
  isAdmin,
  isProjectSocialMediaLead,
  isCalendarPipelinePod,
  canSelfCreateInGroup,
} from "@/lib/permissions";
import { isCompletionTrackedPod, computeGroupCompletion } from "@/lib/completion";
import { CompletionSection } from "./completion-section";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import {
  updateProject,
  attachTaskGroup,
  removeTaskGroup,
  archiveProject,
  unarchiveProject,
  deleteProject,
} from "@/lib/actions/projects";
import { ArchiveProjectButton } from "./archive-project-button";
import { DeleteProjectForm } from "./delete-project-form";
import { UnarchiveProjectButton } from "../unarchive-project-button";
import {
  addProjectAttachment,
  editProjectAttachment,
  deleteProjectAttachment,
} from "@/lib/actions/project-attachments";
import { formatDuration, secondsSince } from "@/lib/format";
import { daysOverdue } from "@/lib/timezone";
import { addTasksToSprint, createSprint, updateSprint, setSprintStatus } from "@/lib/actions/sprints";
import { addBugsToBugSprint, createBugSprint, deleteBugSprint, updateBugSprint } from "@/lib/actions/bug-sprints";
import { bugCountsOf, bugSprintTiming } from "@/lib/bug-sprints";
import { assignBugsInBulk } from "@/lib/actions/bug-assign";
import { getGroupAssigneePool } from "@/lib/task-assignment";
import { statusLabel } from "@/lib/bug";
import { setTeamCapacity } from "@/lib/actions/team-capacity";
import { createMilestone, updateMilestone, toggleMilestone, reorderMilestone, deleteMilestone } from "@/lib/actions/milestones";
import { MilestonesSection } from "./milestones-section";
import { ProjectEditForm } from "./project-edit-form";
import { TaskGroupsSection } from "./task-groups-section";
import { SprintsSection } from "./sprints-section";
import { BugsSection, type BugSprintRow } from "./bugs-section";
import { TaskViews, type ViewTask } from "@/components/task-views";
import { countSprintTasks, sprintCountsFor } from "@/lib/sprint-dashboard";
import { TaskDrawerProvider } from "@/components/task-drawer";
import { ProjectAttachmentsSection } from "./attachments-section";
import { ProjectStatusChip } from "@/components/status-chip";

/**
 * Sorts a project's visible Task Groups so the ones most relevant to the logged-in user
 * surface first: their own Lead-owned group, then a group matching their pod or cluster
 * scope (covers Contributors and pod-restricted Cluster Heads too), then everything else
 * in its original (attach) order. Applies uniformly regardless of role — cluster, pod, or
 * Lead login all get their own group(s) surfaced first.
 */
/** Shared row shape for both grouped and ungrouped task tables — Due Date, Priority,
 * Status, Revisions, and how many days late the assignee's own local calendar day is
 * past the due date (PRD 9.5: computed per-assignee timezone, not server/viewer time). */
type RowInput = {
  id: string;
  name: string;
  status: string;
  priority: string;
  dueDate: Date;
  revisionCount: number;
  taskType: string;
  assignedToId: string | null;
  assignedTo: { name: string; location: string } | null;
  subtasks?: RowInput[];
};

type GroupTaskRow = {
  id: string;
  name: string;
  status: string;
  priority: string;
  dueDate: string;
  revisionCount: number;
  taskType: string;
  assigneeId: string | null;
  assigneeName: string | null;
  daysOverdue: number | null;
  isTimerRunning: boolean;
  subtasks: GroupTaskRow[];
};

function toGroupTaskRow(t: RowInput, now: Date, runningTaskIds: Set<string>): GroupTaskRow {
  return {
    id: t.id,
    name: t.name,
    status: t.status,
    priority: t.priority,
    dueDate: formatDate(t.dueDate),
    revisionCount: t.revisionCount,
    taskType: t.taskType,
    assigneeId: t.assignedToId,
    assigneeName: t.assignedTo?.name ?? null,
    // A Completed task is historical record — "days late" no longer means anything once
    // it's done, so the badge is scoped to still-open work only (My Tasks doesn't need
    // this guard since it excludes Completed entirely, but Task Group view shows every status).
    daysOverdue: t.status === "COMPLETED" ? null : daysOverdue(t.dueDate, t.assignedTo?.location, now),
    isTimerRunning: runningTaskIds.has(t.id),
    subtasks: (t.subtasks ?? []).map((s) => toGroupTaskRow(s, now, runningTaskIds)),
  };
}

// A task as the Kanban/Calendar renderers need it. Built from the SAME visible task set the
// list uses (subtasks flattened), so all three views are scoped identically. dueKey uses the
// UTC calendar components — the same basis formatDate displays — so a card lands on the
// calendar day matching its shown Due Date.
function toViewTask(
  t: {
    id: string;
    name: string;
    status: string;
    onHoldFromStatus: string | null;
    taskType: string;
    priority: string;
    revisionCount: number;
    dueDate: Date;
    assignedTo: { name: string } | null;
    sprint?: { status: string } | null;
    sprintId?: string | null;
    groupId?: string | null;
  },
  projectId: string,
  runningTaskIds: Set<string>,
): ViewTask {
  return {
    id: t.id,
    projectId,
    sprintId: t.sprintId ?? null,
    name: t.name,
    status: t.status,
    onHoldFromStatus: t.onHoldFromStatus ?? null,
    taskType: t.taskType,
    priority: t.priority,
    revisionCount: t.revisionCount,
    assigneeName: t.assignedTo?.name ?? null,
    isTimerRunning: runningTaskIds.has(t.id),
    inActiveSprint: t.sprint?.status === "ACTIVE",
    dueKey: `${t.dueDate.getUTCFullYear()}-${String(t.dueDate.getUTCMonth() + 1).padStart(2, "0")}-${String(t.dueDate.getUTCDate()).padStart(2, "0")}`,
    dueLabel: formatDate(t.dueDate),
  };
}

function groupRelevance(
  user: CurrentUser,
  group: { leadUserId: string; podId: string | null; clusterId: string | null },
) {
  if (group.leadUserId === user.id) return 0;
  const ownRole = user.roles[0];
  if (ownRole?.podId && ownRole.podId === group.podId) return 1;
  if (ownRole && !ownRole.podId && ownRole.clusterId === group.clusterId) return 2;
  return 3;
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sprint?: string; tab?: string; bugSprint?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const now = new Date();
  const { id } = await params;
  const { sprint: sprintParam, tab: tabParam, bugSprint: bugSprintParam } = await searchParams;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      serviceType: true,
      cluster: true,
      accountManager: true,
      dependencyTracker: true,
      taskGroups: { include: { lead: true, pod: true }, orderBy: { createdAt: "asc" } },
      attachments: { include: { addedBy: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) notFound();

  let deleteSummary = "";
  if (isAdmin(user)) {
    const [counts, timeLogCount] = await Promise.all([
      prisma.project.findUnique({
        where: { id },
        select: {
          _count: {
            select: { tasks: true, sprints: true, taskGroups: true, milestones: true, attachments: true, monthlyBriefs: true },
          },
        },
      }),
      prisma.timeLog.count({ where: { task: { projectId: id } } }),
    ]);
    const c = counts?._count;
    deleteSummary = c
      ? `${c.tasks} tasks, ${timeLogCount} time logs, ${c.sprints} sprints, ${c.taskGroups} task groups, ${c.milestones} milestones, ${c.attachments} project links and ${c.monthlyBriefs} monthly briefs, plus their comments, attachments and notifications`
      : "";
  }

  if (!(await canViewProject(user, project))) {
    redirect("/projects");
  }

  const isOversight = canViewAllProjectGroups(user, project);
  const canAttachGroups = canManageTaskGroups(user, project);
  // The project's own Social Media Lead planned the Content Calendar, so they also get
  // read oversight into the Content/Design tasks it generates on this same project.
  const socialMediaOversight = await isProjectSocialMediaLead(user, project.id);

  const [serviceTypes, accountManagers, dependencyTrackers, allLeadRoles, topLevelTasks, timeLogs, runningLogs] = await Promise.all([
    prisma.serviceType.findMany({ orderBy: { name: "asc" } }),
    getEligibleAccountManagers(),
    getEligibleDependencyTrackers(),
    canAttachGroups
      ? prisma.userRole.findMany({
          where: { role: "LEAD" },
          include: { user: true, cluster: true, pod: true },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
    prisma.task.findMany({
      where: { projectId: project.id, parentTaskId: null },
      // Subtasks nest under their parent (PRD 8.2.3) — never a flattened top-level row.
      include: {
        assignedTo: true,
        sprint: { select: { status: true } },
        subtasks: { include: { assignedTo: true, sprint: { select: { status: true } } }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.timeLog.findMany({
      where: { task: { projectId: project.id } },
      select: { durationSeconds: true, startTime: true, task: { select: { groupId: true } } },
    }),
    // Tasks (or subtasks) with a currently-running timer — surfaced in the list view (PRD 8.2.3).
    prisma.timeLog.findMany({
      where: { endTime: null, task: { projectId: project.id } },
      select: { taskId: true },
    }),
  ]);

  const runningTaskIds = new Set(runningLogs.map((l) => l.taskId));

  // Sprint Workflow (PRD 8.14) — surfaced only when a Sprint-enabled discipline (pod) is on
  // this project. The Sprints section, Task Sprint field and board filters all key off this.
  const sprintEnabledGroups = project.taskGroups.filter((g) => g.pod?.sprintWorkflowEnabled);
  const hasSprintWorkflow = sprintEnabledGroups.length > 0;
  const canManageSprintsHere = canManageSprints(user, project, sprintEnabledGroups);
  const sprints = hasSprintWorkflow
    ? await prisma.sprint.findMany({
        where: { projectId: project.id },
        include: { _count: { select: { tasks: true } } },
        orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      })
    : [];

  // Sprint-wise board (final build): clicking any Sprint (Planned/Active/Completed) scopes the
  // existing Kanban to just that sprint's tasks — a navigation filter, not a new screen. Only a
  // real sprint on this project counts; anything else falls back to the full board.
  const focusSprint = sprintParam ? sprints.find((s) => s.id === sprintParam) ?? null : null;

  // Sprints tab: per-sprint task counts for the progress bars, and which sprint's board is shown
  // underneath — the one picked (?sprint=), else the Active sprint, else the first not-completed one.
  const sprintCounts = await countSprintTasks(sprints.map((sp) => sp.id));
  const sprintsByRelevance = [...sprints].sort(
    (a, b) =>
      ({ ACTIVE: 0, PLANNED: 1, COMPLETED: 2 })[a.status] - ({ ACTIVE: 0, PLANNED: 1, COMPLETED: 2 })[b.status] ||
      a.startDate.getTime() - b.startDate.getTime(),
  );

  const sprintTiming = (st: (typeof sprints)[number]) => {
    const DAY = 24 * 60 * 60 * 1000;
    const daysTo = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / DAY);
    const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
    if (st.status === "COMPLETED") return { label: "Completed", tone: "muted" as const };
    if (st.status === "PLANNED") {
      const n = daysTo(st.startDate);
      return n > 0 ? { label: `Starts in ${plural(n)}`, tone: "muted" as const } : { label: "Ready to start", tone: "warn" as const };
    }
    const left = daysTo(st.endDate);
    if (left < 0) return { label: `Ended ${plural(-left)} ago`, tone: "late" as const };
    if (left <= 2) return { label: left === 0 ? "Ends today" : `${plural(left)} left`, tone: "warn" as const };
    return { label: `${plural(left)} left`, tone: "ok" as const };
  };

  // Project Milestones (PRD — agency-wide): an ordered checklist for every project, managed by
  // the project-management tier and read-only for everyone else who can see the project.
  const canManageMilestonesHere = canManageMilestones(user, project);
  const milestones = await prisma.milestone.findMany({
    where: { projectId: project.id },
    orderBy: { order: "asc" },
  });

  // Every LEAD-role instance not already representing a discipline on this project —
  // one option per (user, cluster, pod) tuple, since attaching picks a specific one. A
  // pod-restricted Cluster Head only sees Leads from their own pod(s) in this dropdown.
  const attachedLeadUserIds = new Set(project.taskGroups.map((g) => g.leadUserId));
  const availableLeadRoles = allLeadRoles.filter(
    (r) => r.user.isActive && !attachedLeadUserIds.has(r.userId) && canAttachLeadRole(user, project, r),
  );

  const secondsByGroup = new Map<string, number>();
  let projectTotalSeconds = 0;
  for (const log of timeLogs) {
    const seconds = log.durationSeconds ?? secondsSince(log.startTime);
    projectTotalSeconds += seconds;
    if (log.task.groupId) {
      secondsByGroup.set(log.task.groupId, (secondsByGroup.get(log.task.groupId) ?? 0) + seconds);
    }
  }

  const tasksByGroupId = new Map<string, typeof topLevelTasks>();
  const ungroupedTasks: typeof topLevelTasks = [];
  for (const t of topLevelTasks) {
    if (!t.groupId) {
      ungroupedTasks.push(t);
      continue;
    }
    const arr = tasksByGroupId.get(t.groupId) ?? [];
    arr.push(t);
    tasksByGroupId.set(t.groupId, arr);
  }

  // Task Group *existing-task* visibility is strict (Task Grouping & Cross-Group Handoff,
  // rule 2): a Lead sees the full task list only for their own group; oversight roles
  // (Admin/Cluster Head/Account-Client-Services) see every group's tasks. Task *creation*
  // is project-wide for any Lead attached to this project — so every group's card is
  // surfaced to them (to create/hand off into it) even when its existing tasks stay
  // hidden beyond their own.
  const canCreateAnywhere = canCreateTaskInGroup(user, project);
  const groupCards = project.taskGroups
    .map((group) => {
      const tasks = tasksByGroupId.get(group.id) ?? [];
      const isThisGroupsLead = group.leadUserId === user.id;
      const isCalendarPipelineOversight = socialMediaOversight && isCalendarPipelinePod(group.pod?.name);
      // A user an Admin has restricted to their own tasks never gets the whole-group view, whatever
      // their role (see canViewTask).
      const canSeeAllTasks =
        !user.restrictToOwnTasks && (canOverseeGroup(user, project, group) || isThisGroupsLead || isCalendarPipelineOversight);
      const isOwnTask = (t: (typeof tasks)[number]) => t.assignedToId === user.id || t.createdById === user.id;
      const hasOwnTask = tasks.some(isOwnTask);
      // A Contributor may self-create in a group that belongs to their own pod (PRD 8.2).
      const canSelfCreateHere = canSelfCreateInGroup(user, group);
      const visible = canSeeAllTasks || hasOwnTask || canCreateAnywhere || canSelfCreateHere;
      const shownTasks = canSeeAllTasks ? tasks : tasks.filter(isOwnTask);
      return {
        group,
        visible,
        shownTasks,
        hasHiddenTasks: !canSeeAllTasks && tasks.length > shownTasks.length,
        canCreateTask: canCreateAnywhere || canSelfCreateHere,
        canSeeAll: canSeeAllTasks,
        canRemove: canManageThisGroup(user, project, group) && tasks.length === 0,
        totalSeconds:
          !user.restrictToOwnTasks && (canViewGroupTimeRollup(user, project, group) || isCalendarPipelineOversight)
            ? secondsByGroup.get(group.id) ?? 0
            : null,
      };
    })
    .filter((c) => c.visible)
    .sort((a, b) => groupRelevance(user, a.group) - groupRelevance(user, b.group));

  // A viewer who can't see every task in a Sprint-enabled group (e.g. a Contributor) only sees the
  // sprints that hold a task they can see — not other people's sprints — and counts only those tasks.
  const seesAllSprintTasks = groupCards.some((c) => c.group.pod?.sprintWorkflowEnabled && c.canSeeAll);
  const visibleTopLevelTasks = groupCards.flatMap((c) => c.shownTasks);
  const visibleSprintIds = new Set(
    sprints
      .filter((sp) => seesAllSprintTasks || visibleTopLevelTasks.some((t) => t.sprintId === sp.id))
      .map((sp) => sp.id),
  );
  const visibleSprintsByRelevance = sprintsByRelevance.filter((sp) => visibleSprintIds.has(sp.id));

  const shownUngroupedTasks = isOversight
    ? ungroupedTasks
    : ungroupedTasks.filter((t) => t.assignedToId === user.id || t.createdById === user.id);

  // Project Completion % (final build) — one card per attached Development/Design Task Group the
  // viewer may see: oversight roles see every qualifying discipline; a Lead sees only their own
  // group. Empty (section hidden) on projects with no Dev/Design group, e.g. SEO/Social retainers.
  const allTasksFlat = topLevelTasks.flatMap((t) => [t, ...(t.subtasks ?? [])]);
  const completionGroups = project.taskGroups
    .filter(
      (g) =>
        isCompletionTrackedPod(g.pod?.name) &&
        (canOverseeGroup(user, project, g) || g.leadUserId === user.id),
    )
    .map((g) => {
      const groupTasks = allTasksFlat.filter((t) => t.groupId === g.id);
      return { id: g.id, name: g.name, ...computeGroupCompletion(groupTasks, user.location, now) };
    });

  // Flat, identically-scoped task set for the Kanban/Calendar renderings — the exact same
  // tasks the list shows (subtasks flattened into their own cards, since those views don't
  // nest). Switching view never widens what's visible (PRD 8.11 §1).
  const flatViewTasks: ViewTask[] = [
    ...groupCards.flatMap((c) => c.shownTasks),
    ...shownUngroupedTasks,
  ].flatMap((t) => [
    toViewTask(t, project.id, runningTaskIds),
    ...(t.subtasks ?? []).map((s) => toViewTask(s, project.id, runningTaskIds)),
  ]);
  const todayKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  const canEdit = canEditProjectInCluster(user, project);
  const canSeeMaxHours = canViewMaxAllocatedHours(user, project);
  const canSeeProjectTotal = canViewProjectTimeRollup(user, project);

  const updateProjectWithId = updateProject.bind(null, project.id);
  const attachTaskGroupWithId = attachTaskGroup.bind(null, project.id);
  const removeTaskGroupWithId = removeTaskGroup.bind(null, project.id);
  const createSprintWithId = createSprint.bind(null, project.id);
  const createMilestoneWithId = createMilestone.bind(null, project.id);
  const addProjectAttachmentWithId = addProjectAttachment.bind(null, project.id);
  const editProjectAttachmentWithId = editProjectAttachment.bind(null, project.id);
  const deleteProjectAttachmentWithId = deleteProjectAttachment.bind(null, project.id);

  // Existing tasks this person could put into a sprint: top-level, not completed, in a Sprint-enabled
  // group, either in the backlog or in another open sprint, and ones they may move (a Sprint manager
  // sees all they can see; anyone else only their own).
  const sprintById = new Map(sprints.map((sp) => [sp.id, sp]));
  const sprintCandidates = groupCards
    .filter((c) => c.group.pod?.sprintWorkflowEnabled)
    .flatMap((c) => c.shownTasks.map((t) => ({ t, groupName: c.group.name })))
    .filter(({ t }) => {
      if (t.status === "COMPLETED") return false;
      if (!(canManageSprintsHere || t.assignedToId === user.id || t.createdById === user.id)) return false;
      const current = t.sprintId ? sprintById.get(t.sprintId) : null;
      return !current || current.status !== "COMPLETED";
    })
    .map(({ t, groupName }) => ({
      id: t.id,
      name: t.name,
      groupName,
      assigneeName: t.assignedTo?.name ?? null,
      sprintId: t.sprintId ?? null,
      sprintName: t.sprintId ? sprintById.get(t.sprintId)?.name ?? null : null,
    }))
    .sort((a, b) => Number(!!a.sprintId) - Number(!!b.sprintId) || a.name.localeCompare(b.name));

  // Bugs tab (shown only when a Bug-Tracking team the viewer can see is on this project): the project's
  // bugs grouped into bug sprints — a category (Frontend, Backend, Regression Retesting…) with a due date.
  // Bugs follow the same visibility as the task list (shownTasks), so counts always match the board.
  const bugGroupCards = groupCards.filter((c) => c.group.pod?.bugTrackingEnabled);
  const hasBugTracking = bugGroupCards.length > 0;
  const bugGroupsAll = project.taskGroups.filter((g) => g.pod?.bugTrackingEnabled);
  const canManageBugSprintsHere = canManageBugSprints(user, project, bugGroupsAll);
  const canReportBugHere = bugGroupCards.some((c) => c.canCreateTask);
  const bugSprints = hasBugTracking
    ? await prisma.bugSprint.findMany({ where: { projectId: project.id }, orderBy: [{ dueDate: "asc" }, { name: "asc" }] })
    : [];
  const shownBugs = bugGroupCards.flatMap((c) =>
    c.shownTasks.filter((t) => t.taskType === "BUG").map((t) => ({ t, groupName: c.group.name, group: c.group })),
  );
  const bugSprintById = new Map(bugSprints.map((b) => [b.id, b]));
  const bugsByBugSprint: Record<string, ViewTask[]> = {};
  const bugRowsRaw: Record<string, typeof shownBugs> = {};
  for (const entry of shownBugs) {
    const key = entry.t.bugSprintId && bugSprintById.has(entry.t.bugSprintId) ? entry.t.bugSprintId : "none";
    (bugsByBugSprint[key] ??= []).push(toViewTask(entry.t, project.id, runningTaskIds));
    (bugRowsRaw[key] ??= []).push(entry);
  }
  // Same rule as Sprints: unless the viewer sees every bug on a Bug-Tracking team, only bug sprints that hold
  // a bug they can see are listed.
  const seesAllBugs = bugGroupCards.some((c) => c.canSeeAll);
  const bugSprintRows: BugSprintRow[] = bugSprints
    .filter((b) => seesAllBugs || (bugRowsRaw[b.id] ?? []).length > 0)
    .map((b) => {
      const counts = bugCountsOf((bugRowsRaw[b.id] ?? []).map((e) => e.t));
      const timing = bugSprintTiming(b.dueDate, counts, now);
      return {
        id: b.id,
        name: b.name,
        dueLabel: formatDate(b.dueDate),
        dueInput: b.dueDate.toISOString().slice(0, 10),
        bugCount: counts.total,
        counts,
        timingLabel: timing.label,
        timingTone: timing.tone,
        dueMs: b.dueDate.getTime(),
        finished: counts.total > 0 && counts.completed === counts.total,
      };
    })
    // Soonest due first; a bug sprint whose bugs are all closed drops to the bottom.
    .sort((a, b) => Number(a.finished) - Number(b.finished) || a.dueMs - b.dueMs)
    .map(({ dueMs: _d, finished: _f, ...row }) => row);
  if ((bugRowsRaw.none ?? []).length > 0) {
    const counts = bugCountsOf((bugRowsRaw.none ?? []).map((e) => e.t));
    bugSprintRows.push({
      id: "none",
      name: "Not in a bug sprint",
      isBucket: true,
      dueLabel: "",
      dueInput: "",
      bugCount: counts.total,
      counts,
      timingLabel: "",
      timingTone: "muted",
    });
  }
  // Existing bugs this person could file under a bug sprint (open ones they manage or own).
  const bugCandidates = shownBugs
    .filter(({ t }) => t.status !== "COMPLETED" && canAssignBugToBugSprint(user, project, bugGroupsAll, t))
    .map(({ t, groupName }) => {
      const current = t.bugSprintId ? bugSprintById.get(t.bugSprintId) : null;
      return {
        id: t.id,
        name: t.name,
        groupName,
        assigneeName: t.assignedTo?.name ?? null,
        sprintId: current?.id ?? null,
        sprintName: current?.name ?? null,
      };
    })
    .sort((a, b) => Number(!!a.sprintId) - Number(!!b.sprintId) || a.name.localeCompare(b.name));

  // Bulk assign (a team Lead triaging a batch): the open bugs on teams this viewer leads, and the people on
  // those teams they can be handed to. Empty for everyone else, so the button never shows.
  const assignableBugEntries = shownBugs.filter(({ t, group }) => t.status !== "COMPLETED" && canAssignAnyoneInGroup(user, group));
  const assignPools = assignableBugEntries.length
    ? await Promise.all(
        bugGroupsAll.filter((g) => canAssignAnyoneInGroup(user, g)).map((g) => getGroupAssigneePool(g, project.clusterId)),
      )
    : [];
  const bugAssigneeOptions = Array.from(new Map(assignPools.flat().map((u) => [u.id, u])).values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const assignableBugs = assignableBugEntries.map(({ t, groupName }) => ({
    id: t.id,
    name: t.name,
    groupName,
    assigneeName: t.assignedTo?.name ?? null,
    sprintId: t.bugSprintId && bugSprintById.has(t.bugSprintId) ? t.bugSprintId : null,
    sprintName: null,
    badge: statusLabel(t.status, "BUG"),
  }));

  // Sprints and Bugs get their own tabs, shown only when the project has the matching discipline.
  const activeTab =
    tabParam === "overview"
      ? "overview"
      : tabParam === "sprints" && hasSprintWorkflow
        ? "sprints"
        : tabParam === "bugs" && hasBugTracking
          ? "bugs"
          : "tasks";
  const taskCount = flatViewTasks.length;
  const deadlinePassed =
    !!project.deadline && project.deadline < now && project.status !== "COMPLETED" && project.status !== "CANCELLED";
  const tabs: { key: string; label: string; href: string; count: number | undefined }[] = [
    { key: "tasks", label: "Tasks", href: `/projects/${project.id}`, count: taskCount },
    ...(hasSprintWorkflow
      ? [{ key: "sprints", label: "Sprints", href: `/projects/${project.id}?tab=sprints`, count: visibleSprintIds.size }]
      : []),
    ...(hasBugTracking
      ? [{ key: "bugs", label: "Bugs", href: `/projects/${project.id}?tab=bugs`, count: shownBugs.length }]
      : []),
    { key: "overview", label: "Overview", href: `/projects/${project.id}?tab=overview`, count: undefined },
  ];

  return (
    // Wider than a single reading column — the Task Group tables below have 6 columns
    // (Task/Assignee/Due Date/Priority/Status/Revisions) that were cramped to ~78px for
    // Due Date at max-w-2xl, tight enough for an overdue badge to wrap awkwardly.
    <div>
      <Link href="/projects" className="text-sm text-gs-gray hover:text-gs-black hover:underline">
        ← Projects
      </Link>

      <header className="mt-3 rounded-xl border border-gs-gray/10 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{project.name}</h1>
              <ProjectStatusChip status={project.status} />
              {project.archivedAt && (
                <span className="rounded-full bg-gs-light px-2.5 py-0.5 text-xs font-medium text-gs-gray">Archived</span>
              )}
            </div>
            <p className="mt-1.5 text-sm text-gs-gray">
              {project.client.name} · {project.cluster.name} · {project.serviceType.name}
              {project.referenceNumber ? ` · Ref ${project.referenceNumber}` : ""}
            </p>
          </div>
          {canSeeProjectTotal && (
            <Link
              href={`/projects/${project.id}/report`}
              className="btn btn-secondary"
            >
              Core Project/Task Report
            </Link>
          )}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-gs-gray/10 pt-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gs-gray">Deadline</dt>
            <dd className={`mt-1 text-sm font-semibold ${deadlinePassed ? "text-gs-red" : ""}`}>
              {project.deadline ? formatDate(project.deadline) : "—"}
              {deadlinePassed && <span className="ml-1.5 text-xs font-medium">Overdue</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gs-gray">Start date</dt>
            <dd className="mt-1 text-sm font-semibold">{project.startDate ? formatDate(project.startDate) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gs-gray">Tasks</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums">{taskCount}</dd>
          </div>
          {canSeeProjectTotal && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gs-gray">Time logged</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums">{formatDuration(projectTotalSeconds)}</dd>
            </div>
          )}
        </dl>
      </header>

      <nav aria-label="Project sections" className="mt-6 flex gap-1 border-b border-gs-gray/20">
        {tabs.map((t) => {
          const active = t.key === activeTab;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors ${
                active ? "border-gs-red text-gs-black" : "border-transparent text-gs-gray hover:text-gs-black"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-gs-gray shadow-sm">
                  {t.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {activeTab === "tasks" ? (
        <div className="pt-2">
          <TaskDrawerProvider>
          <TaskViews
            surfacePath={`/projects/${project.id}`}
            tasks={flatViewTasks}
            todayKey={todayKey}
            sprintFilterEnabled={hasSprintWorkflow}
            focusSprint={focusSprint ? { id: focusSprint.id, name: focusSprint.name } : undefined}
          >
            <TaskGroupsSection
            projectId={project.id}
            groupCards={groupCards.map((c) => ({
              id: c.group.id,
              name: c.group.name,
              leadName: c.group.lead.name,
              tasks: c.shownTasks.map((t) => toGroupTaskRow(t, now, runningTaskIds)),
              hasHiddenTasks: c.hasHiddenTasks,
              canCreateTask: c.canCreateTask,
              canRemove: c.canRemove,
              totalSeconds: c.totalSeconds,
              // Team Capacity (hrs/wk) — Development/QA teams only; editable by Admin/Cluster Head.
              isDevQa: !!c.group.pod?.sprintWorkflowEnabled,
              capacity: c.group.capacityHoursPerWeek?.toString() ?? null,
              canEditCapacity: canSetTeamCapacity(user, project, c.group),
            }))}
            ungroupedTasks={shownUngroupedTasks.map((t) => toGroupTaskRow(t, now, runningTaskIds))}
            setCapacityAction={setTeamCapacity}
            canAttachGroups={canAttachGroups}
            availableLeadRoles={availableLeadRoles.map((r) => ({
              id: r.id,
              label: [r.user.name, [r.cluster?.name, r.pod?.name].filter(Boolean).join(" · ")].filter(Boolean).join(" · "),
            }))}
            attachAction={attachTaskGroupWithId}
            removeAction={removeTaskGroupWithId}
            />
          </TaskViews>
          </TaskDrawerProvider>
        </div>
      ) : activeTab === "sprints" ? (
        <div className="pt-4">
          {/* Each sprint is an expandable panel with its own board. The sprint picked in the URL
              (?sprint=, e.g. from the Sprints menu) starts open; otherwise the Active one does. */}
          <SprintsSection
            surfacePath={`/projects/${project.id}`}
            defaultOpenId={(focusSprint && visibleSprintIds.has(focusSprint.id) ? focusSprint : visibleSprintsByRelevance[0])?.id ?? null}
            canManage={canManageSprintsHere}
            createAction={createSprintWithId}
            updateAction={updateSprint}
            setStatusAction={setSprintStatus}
            addTasksAction={addTasksToSprint}
            candidates={sprintCandidates}
            tasksBySprint={Object.fromEntries(
              visibleSprintsByRelevance.map((sp) => [sp.id, flatViewTasks.filter((t) => t.sprintId === sp.id)]),
            )}
            sprints={visibleSprintsByRelevance.map((sp) => {
              const timing = sprintTiming(sp);
              const counts = seesAllSprintTasks
                ? sprintCountsFor(sprintCounts, sp.id)
                : bugCountsOf(visibleTopLevelTasks.filter((t) => t.sprintId === sp.id));
              return {
                id: sp.id,
                name: sp.name,
                status: sp.status,
                startLabel: formatDate(sp.startDate),
                endLabel: formatDate(sp.endDate),
                startInput: sp.startDate.toISOString().slice(0, 10),
                endInput: sp.endDate.toISOString().slice(0, 10),
                taskCount: seesAllSprintTasks ? sp._count.tasks : counts.total,
                datesLocked: sp.status !== "PLANNED",
                counts,
                timingLabel: timing.label,
                timingTone: timing.tone,
              };
            })}
          />
        </div>
      ) : activeTab === "bugs" ? (
        <div className="pt-4">
          <BugsSection
            projectId={project.id}
            surfacePath={`/projects/${project.id}`}
            canManage={canManageBugSprintsHere}
            canReport={canReportBugHere}
            defaultOpenId={bugSprintParam ?? null}
            sprints={bugSprintRows}
            bugsBySprint={bugsByBugSprint}
            candidates={bugCandidates}
            assignable={assignableBugs}
            assigneeOptions={bugAssigneeOptions}
            assignAction={assignBugsInBulk.bind(null, project.id)}
            createAction={createBugSprint.bind(null, project.id)}
            updateAction={updateBugSprint}
            deleteAction={deleteBugSprint}
            addBugsAction={addBugsToBugSprint}
          />
        </div>
      ) : (
        <div className="pt-2">
          <CompletionSection groups={completionGroups} />

          {/* Constrained narrower than the page itself — short form fields/labels stretching
              to the full table width below would read as ungrounded, not "denser". */}
          <div className="mt-6 max-w-2xl">
            {canEdit ? (
              <ProjectEditForm
                action={updateProjectWithId}
                serviceTypes={serviceTypes}
                accountManagers={accountManagers}
                dependencyTrackers={dependencyTrackers}
                defaults={{ ...project, accountManagerName: project.accountManager?.name ?? null, dependencyTrackerName: project.dependencyTracker?.name ?? null }}
                canSeeMaxAllocatedHours={canSeeMaxHours}
                canAssignAccountManager={canAssignAccountManager(user, project)}
                canAssignDependencyTracker={canAssignDependencyTracker(user, project)}
              />
            ) : (
              <div className="flex flex-col gap-2 rounded-lg border border-gs-gray/15 bg-white p-6 text-sm">
                <p><span className="text-gs-gray">Service Type:</span> {project.serviceType.name}</p>
                <p><span className="text-gs-gray">Reference Number:</span> {project.referenceNumber ?? "—"}</p>
                <p><span className="text-gs-gray">Status:</span> {project.status}</p>
                {project.summary && (
                  <p><span className="text-gs-gray">Summary:</span> {project.summary}</p>
                )}
                <p><span className="text-gs-gray">Account Manager:</span> {project.accountManager?.name ?? "Unassigned"}</p>
                <p><span className="text-gs-gray">Dependency Tracker:</span> {project.dependencyTracker?.name ?? "Unassigned"}</p>
                {canSeeMaxHours && (
                  <p>
                    <span className="text-gs-gray">Max Allocated Hours:</span>{" "}
                    {project.maxAllocatedHours
                      ? `${project.maxAllocatedHours.toString()} ${project.hoursAllocationType === "MONTHLY" ? "hrs/month" : "hrs total"}`
                      : "—"}
                  </p>
                )}
              </div>
            )}
          </div>

          <ProjectAttachmentsSection
            attachments={project.attachments}
            currentUserId={user.id}
            canDelete={isAdmin(user)}
            addAction={addProjectAttachmentWithId}
            editAction={editProjectAttachmentWithId}
            deleteAction={deleteProjectAttachmentWithId}
          />

          <MilestonesSection
            canManage={canManageMilestonesHere}
            createAction={createMilestoneWithId}
            toggleAction={toggleMilestone}
            updateAction={updateMilestone}
            reorderAction={reorderMilestone}
            deleteAction={deleteMilestone}
            milestones={milestones.map((m) => ({
              id: m.id,
              title: m.title,
              dueLabel: formatDate(m.dueDate),
              dueInput: m.dueDate.toISOString().slice(0, 10),
              completed: m.completed,
            }))}
          />

          {isAdmin(user) && (
            <section className="mt-10 max-w-2xl rounded-lg border border-gs-gray/15 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold">Admin actions</h2>
              <div className="mt-3 flex flex-wrap items-start gap-3">
                {project.archivedAt ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-md border border-gs-gray/20 bg-gs-light px-3 py-2 text-sm">
                    <span className="text-gs-gray">This project is archived — hidden from listings and reports.</span>
                    <UnarchiveProjectButton action={unarchiveProject.bind(null, project.id)} />
                  </div>
                ) : (
                  <ArchiveProjectButton projectName={project.name} action={archiveProject.bind(null, project.id)} />
                )}
                <DeleteProjectForm
                  projectName={project.name}
                  summary={deleteSummary}
                  action={deleteProject.bind(null, project.id)}
                />
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
