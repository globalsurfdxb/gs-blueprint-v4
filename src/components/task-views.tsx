"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { statusLabel } from "@/lib/bug";
import { useToast } from "@/components/toast";
import { changeTaskStatusByDrag } from "@/lib/actions/task-status";
import { TaskOpener, useTaskDrawer } from "@/components/task-drawer";
import { isFailure, noticeOf, readableError } from "@/lib/action-result";
import { Select } from "@/components/select";

// A single task as the Kanban/Calendar renderers need it. The server sends this already
// scoped to what the viewer may see — the view toggle NEVER changes the query, only the
// rendering, so visibility is identical across List/Kanban/Calendar (PRD 8.11 §1).
export type ViewTask = {
  id: string;
  projectId: string;
  name: string;
  status: string;
  onHoldFromStatus: string | null;
  taskType: string;
  priority: string;
  revisionCount: number;
  assigneeName: string | null;
  isTimerRunning: boolean;
  dueKey: string; // YYYY-MM-DD in the viewer's own locale (computed server-side)
  dueLabel: string; // DD/MM/YYYY for display
  /** Who created it — shown as its own row on the card when given. */
  createdByName?: string | null;
  // Agile Sprint Workflow (PRD 8.14) — true when this task is in a Sprint whose status is
  // ACTIVE. Drives the optional "Active Sprint only" Kanban filter; false for Backlog tasks
  // and for any surface where Sprint Workflow doesn't apply.
  inActiveSprint?: boolean;
  // Sprint-wise board (final build) — the task's Sprint, so the board can be scoped to one
  // specific sprint (Planned/Active/Completed) when opened from a Sprint card. null = Backlog.
  sprintId?: string | null;
  // Cross-project surfaces (My Tasks) set this so each card shows which project it belongs to;
  // single-project surfaces (a project board) leave it undefined and nothing extra renders.
  projectName?: string;
  /** "Project · Client" — when set, boards that mix projects (Bugs) show it as its own line on each
   * Kanban card and Calendar entry, so the project is always visible, not buried in the small print. */
  projectLabel?: string;
};

type ViewMode = "list" | "kanban" | "calendar";

// Kanban columns are exactly the existing Status Workflow's resting states — no Backlog/To
// Do/Testing (PRD 8.11 §2). Revision is momentary (it lands back in In Progress) and On Hold
// keeps its underlying status, so neither is a column — both render as card badges instead.
const COLUMNS: { status: string; label: string }[] = [
  { status: "NEW", label: "New" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "REVIEW", label: "Review" },
  { status: "COMPLETED", label: "Completed" },
];

// The same four columns, worded the way bugs are talked about (QA C-02).
const BUG_COLUMN_LABELS: Record<string, string> = {
  NEW: "Open",
  IN_PROGRESS: "In Progress",
  REVIEW: "Ready for Retest",
  COMPLETED: "Closed",
};

const PRIORITY_DOT: Record<string, string> = {
  URGENT: "bg-gs-red",
  HIGH: "bg-amber-500",
  MEDIUM: "bg-gs-gray",
  LOW: "bg-gs-gray/40",
};

/** Which Kanban column a task sits in. A held card sits in the column of the status it was
 * held from; a (momentary) Revision falls back to In Progress. */
function columnOf(t: ViewTask): string {
  const s = t.status === "ON_HOLD" ? t.onHoldFromStatus ?? "IN_PROGRESS" : t.status;
  if (s === "REVISION") return "IN_PROGRESS";
  return COLUMNS.some((c) => c.status === s) ? s : "IN_PROGRESS";
}

/** Only cards with a real forward move are draggable; Completed is terminal and a held card
 * must be resumed on its detail page first. The SERVER still re-checks every move regardless. */
function isDraggable(t: ViewTask): boolean {
  return t.status === "NEW" || t.status === "IN_PROGRESS" || t.status === "REVIEW";
}

// ---------- date helpers (pure YYYY-MM-DD math, timezone-agnostic) ----------

function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
function addDays(key: string, n: number): string {
  const d = parseKey(key);
  d.setUTCDate(d.getUTCDate() + n);
  return toKey(d);
}
function addMonths(key: string, n: number): string {
  const d = parseKey(key);
  d.setUTCMonth(d.getUTCMonth() + n);
  return toKey(d);
}
/** 0 = Monday … 6 = Sunday. */
function weekdayMon0(key: string): number {
  return (parseKey(key).getUTCDay() + 6) % 7;
}
function startOfWeek(key: string): string {
  return addDays(key, -weekdayMon0(key));
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ---------- shared card bits ----------

function CardMeta({ t, hideProject = false }: { t: ViewTask; hideProject?: boolean }) {
  // One fact per row so each reads on its own: priority, due date, assignee, project.
  return (
    <div className="mt-1.5 flex flex-col gap-0.5 text-[11px] text-gs-gray">
      <span className="inline-flex items-center gap-1.5">
        <span className={`inline-block h-2 w-2 rounded-full ${PRIORITY_DOT[t.priority] ?? "bg-gs-gray"}`} aria-hidden />
        {t.priority.charAt(0) + t.priority.slice(1).toLowerCase()} priority
      </span>
      <span>
        Due <span className="font-medium text-gs-black/80">{t.dueLabel}</span>
      </span>
      {t.assigneeName && <span>Assigned to {t.assigneeName}</span>}
      {t.createdByName && <span>Created by {t.createdByName}</span>}
      {!hideProject && (t.projectLabel ?? t.projectName) && (
        <span className="font-medium">{t.projectLabel ?? t.projectName}</span>
      )}
    </div>
  );
}

function CardBadges({ t }: { t: ViewTask }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {t.taskType === "BUG" && (
        <span className="rounded-full bg-gs-red/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-gs-red">Bug</span>
      )}
      {t.status === "ON_HOLD" && (
        <span className="rounded-full bg-gs-gray/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-gs-gray">On Hold</span>
      )}
      {t.revisionCount > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
            t.revisionCount >= 2 ? "bg-gs-red/10 text-gs-red" : "bg-amber-500/15 text-amber-600"
          }`}
        >
          {t.taskType === "BUG" ? "Reopens" : "Rev"} {t.revisionCount}
        </span>
      )}
      {t.isTimerRunning && (
        <span className="inline-flex items-center gap-1 rounded-full bg-gs-red/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-gs-red">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-gs-red" aria-hidden />
          Running
        </span>
      )}
    </span>
  );
}

// ---------- Kanban ----------

export function KanbanBoard({
  tasks,
  surfacePath,
  kind = "task",
}: {
  tasks: ViewTask[];
  surfacePath: string;
  /** "bug" words the columns Open / In Progress / Ready for Retest / Closed. */
  kind?: "task" | "bug";
}) {
  const { addToast } = useToast();
  const [pending, startTransition] = useTransition();
  const drawer = useTaskDrawer();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  function onDrop(targetStatus: string) {
    const id = draggingId;
    setDraggingId(null);
    setOverColumn(null);
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || columnOf(task) === targetStatus) return; // no-op drop onto same column
    startTransition(async () => {
      try {
        const result = await changeTaskStatusByDrag(id, targetStatus, surfacePath);
        if (isFailure(result)) {
          // Same plain-language rejection a blocked status change gives elsewhere — the card
          // snaps back because we never moved it optimistically; the data is the source of truth.
          addToast(result.error, "error");
          return;
        }
        addToast("Task moved.", "success");
        const notice = noticeOf(result);
        if (notice) addToast(notice, "success");
      } catch (e) {
        addToast(readableError(e), "error");
      }
    });
  }

  // Below lg the columns are a horizontal swipe strip (stacking a 5-lane board vertically
  // defeats the point); at lg+ they lay out as a 4-column grid with no scroll.
  return (
    <div className={`flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-x-visible lg:pb-0 ${pending ? "pointer-events-none opacity-60" : ""}`}>
      {COLUMNS.map((c) => ({ ...c, label: kind === "bug" ? BUG_COLUMN_LABELS[c.status] ?? c.label : c.label })).map((col) => {
        const colTasks = tasks.filter((t) => columnOf(t) === col.status);
        return (
          <div
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault();
              setOverColumn(col.status);
            }}
            onDragLeave={() => setOverColumn((c) => (c === col.status ? null : c))}
            onDrop={() => onDrop(col.status)}
            className={`flex min-h-24 w-64 shrink-0 flex-col rounded-xl border p-2.5 transition-colors duration-200 lg:w-auto lg:shrink ${
              overColumn === col.status ? "border-gs-red/60 bg-gs-red/5" : "border-transparent bg-gs-black/[0.04]"
            }`}
          >
            <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase text-gs-gray">
              <span>{col.label}</span>
              <span className="rounded-full bg-white px-1.5 text-[10px]">{colTasks.length}</span>
            </div>
            {/* A long column scrolls inside itself (header stays put) instead of stretching the page. */}
            <div className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto pr-0.5">
              {colTasks.map((t) => (
                <div
                  key={t.id}
                  draggable={isDraggable(t)}
                  // The whole card opens the task, not only its title (a drag never produces a click).
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label")) return;
                    drawer?.openTask(t.id);
                  }}
                  onDragStart={() => setDraggingId(t.id)}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOverColumn(null);
                  }}
                  className={`rounded-lg border border-gs-gray/10 bg-white p-3 text-sm shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-gs-gray/25 hover:shadow-md ${
                    isDraggable(t) ? "cursor-grab active:cursor-grabbing" : ""
                  } ${draggingId === t.id ? "scale-[0.97] rotate-1 opacity-50" : ""} ${t.status === "COMPLETED" ? "bg-gs-light/60" : ""}`}
                >
                  {t.projectLabel && (
                    <p className="mb-1 truncate text-[11px] font-semibold text-gs-gray" title={t.projectLabel}>
                      {t.projectLabel}
                    </p>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <TaskOpener
                      taskId={t.id}
                      projectId={t.projectId}
                      className={`text-left font-medium leading-snug hover:underline ${t.status === "COMPLETED" ? "text-gs-gray line-through decoration-gs-gray/40" : ""}`}
                    >
                      {t.status === "COMPLETED" && <span className="mr-1 text-emerald-600 no-underline">✓</span>}
                      {t.name}
                    </TaskOpener>
                  </div>
                  <div className="mt-1"><CardBadges t={t} /></div>
                  <p className="mt-1 text-[10px] font-medium uppercase text-gs-gray">{statusLabel(t.status, t.taskType)}</p>
                  <CardMeta t={t} hideProject={!!t.projectLabel} />
                </div>
              ))}
              {colTasks.length === 0 && <p className="px-1 py-2 text-[11px] text-gs-gray/70">—</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Calendar ----------

function CalendarEntry({ t }: { t: ViewTask }) {
  return (
    <TaskOpener
      taskId={t.id}
      projectId={t.projectId}
      className={`flex w-full items-start gap-1 rounded px-1 py-0.5 text-left text-[11px] transition-colors duration-150 hover:bg-gs-red/10 hover:text-gs-red ${t.status === "COMPLETED" ? "text-gs-gray line-through decoration-gs-gray/40" : ""}`}
    >
      {t.status === "COMPLETED" ? (
        <span className="shrink-0 text-emerald-600 no-underline" aria-label="Completed">✓</span>
      ) : (
        <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[t.priority] ?? "bg-gs-gray"}`} aria-hidden />
      )}
      <span className="min-w-0 flex-1" title={t.projectLabel ? `${t.name} — ${t.projectLabel}` : t.name}>
        <span className="block truncate">{t.name}</span>
        {t.projectLabel && (
          <span className="block truncate text-[10px] font-normal text-gs-gray no-underline">{t.projectLabel}</span>
        )}
      </span>
    </TaskOpener>
  );
}

function CalendarView({ tasks, todayKey }: { tasks: ViewTask[]; todayKey: string }) {
  const [mode, setMode] = useState<"month" | "week" | "day">("month");
  const [anchor, setAnchor] = useState(todayKey);

  const byDay = new Map<string, ViewTask[]>();
  for (const t of tasks) {
    const arr = byDay.get(t.dueKey) ?? [];
    arr.push(t);
    byDay.set(t.dueKey, arr);
  }

  const step = mode === "month" ? addMonths : mode === "week" ? (k: string, n: number) => addDays(k, n * 7) : addDays;
  const anchorDate = parseKey(anchor);
  const heading =
    mode === "month"
      ? `${MONTHS[anchorDate.getUTCMonth()]} ${anchorDate.getUTCFullYear()}`
      : mode === "week"
        ? `Week of ${parseKey(startOfWeek(anchor)).getUTCDate()} ${MONTHS[parseKey(startOfWeek(anchor)).getUTCMonth()].slice(0, 3)} ${parseKey(startOfWeek(anchor)).getUTCFullYear()}`
        : `${anchorDate.getUTCDate()} ${MONTHS[anchorDate.getUTCMonth()]} ${anchorDate.getUTCFullYear()}`;

  // Build the visible day keys for month/week grids.
  let gridDays: string[] = [];
  if (mode === "month") {
    const firstOfMonth = toKey(new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), 1)));
    const gridStart = startOfWeek(firstOfMonth);
    gridDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  } else if (mode === "week") {
    const ws = startOfWeek(anchor);
    gridDays = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setAnchor((a) => step(a, -1))} className="btn btn-secondary h-8 w-8" aria-label="Previous">‹</button>
          <button type="button" onClick={() => setAnchor(todayKey)} className="btn btn-secondary btn-sm h-8">Today</button>
          <button type="button" onClick={() => setAnchor((a) => step(a, 1))} className="btn btn-secondary h-8 w-8" aria-label="Next">›</button>
          <span className="ml-2 text-sm font-semibold">{heading}</span>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg bg-gs-black/[0.06] p-1">
          {(["month", "week", "day"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-all duration-200 ${mode === m ? "bg-white text-gs-black shadow-sm" : "text-gs-gray hover:text-gs-black"}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {mode !== "day" ? (
        <>
          {/* Mobile agenda — a 7-column grid is unreadable below sm, so list the days that have
              tasks instead. Grid shows from sm up. */}
          <div className="mt-3 sm:hidden">
            {(() => {
              const days = gridDays.filter(
                (k) => (mode === "week" || parseKey(k).getUTCMonth() === anchorDate.getUTCMonth()) && (byDay.get(k)?.length ?? 0) > 0,
              );
              if (days.length === 0) {
                return <p className="rounded-lg border border-gs-gray/15 bg-white p-4 text-sm text-gs-gray">No tasks due this {mode}.</p>;
              }
              return (
                <div className="flex flex-col gap-3">
                  {days.map((key) => (
                    <div key={key} className="rounded-lg border border-gs-gray/15 bg-white p-3">
                      <button
                        type="button"
                        onClick={() => {
                          setAnchor(key);
                          setMode("day");
                        }}
                        className={`mb-1.5 text-xs font-semibold uppercase ${key === todayKey ? "text-gs-red" : "text-gs-gray"}`}
                      >
                        {WEEKDAYS[weekdayMon0(key)]} {parseKey(key).getUTCDate()} {MONTHS[parseKey(key).getUTCMonth()].slice(0, 3)}
                        {key === todayKey ? " · Today" : ""}
                      </button>
                      <div className="flex flex-col gap-0.5">
                        {(byDay.get(key) ?? []).map((t) => <CalendarEntry key={t.id} t={t} />)}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="mt-3 hidden overflow-x-auto sm:block">
          <div className="grid min-w-[560px] grid-cols-7 gap-px rounded-lg bg-gs-gray/15">
            {WEEKDAYS.map((w) => (
              <div key={w} className="bg-gs-light px-2 py-1 text-center text-[10px] font-semibold uppercase text-gs-gray">{w}</div>
            ))}
            {gridDays.map((key) => {
              const dayTasks = byDay.get(key) ?? [];
              const inMonth = mode === "week" || parseKey(key).getUTCMonth() === anchorDate.getUTCMonth();
              return (
                <div key={key} className={`min-h-20 bg-white p-1 transition-colors duration-150 hover:bg-gs-light/60 ${inMonth ? "" : "opacity-40"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setAnchor(key);
                      setMode("day");
                    }}
                    className={`mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] hover:bg-gs-light ${
                      key === todayKey ? "bg-gs-red font-semibold text-white hover:bg-gs-red" : "text-gs-gray"
                    }`}
                  >
                    {parseKey(key).getUTCDate()}
                  </button>
                  <div className="flex flex-col gap-0.5">
                    {dayTasks.slice(0, 4).map((t) => <CalendarEntry key={t.id} t={t} />)}
                    {dayTasks.length > 4 && <span className="px-1 text-[10px] text-gs-gray">+{dayTasks.length - 4} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </>
      ) : (
        <div className="mt-3 rounded-lg border border-gs-gray/15 bg-white p-4">
          {(byDay.get(anchor) ?? []).length === 0 ? (
            <p className="text-sm text-gs-gray">No tasks due on this day.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(byDay.get(anchor) ?? []).map((t) => (
                <div key={t.id} className="rounded-md border border-gs-gray/15 p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <TaskOpener taskId={t.id} projectId={t.projectId} className="text-left font-medium hover:underline">{t.name}</TaskOpener>
                    <CardBadges t={t} />
                  </div>
                  <p className="mt-0.5 text-[10px] font-medium uppercase text-gs-gray">{statusLabel(t.status, t.taskType)}</p>
                  <CardMeta t={t} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- board filters ----------

type BoardFilters = { status: string; priority: string; type: string; owner: string; project: string };
const NO_FILTERS: BoardFilters = { status: "all", priority: "all", type: "all", owner: "all", project: "all" };

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="field field-sm text-xs"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </Select>
  );
}

// ---------- toggle wrapper ----------

const TOGGLE: { mode: ViewMode; label: string }[] = [
  { mode: "list", label: "List" },
  { mode: "kanban", label: "Kanban" },
  { mode: "calendar", label: "Calendar" },
];

/**
 * List / Kanban / Calendar view toggle (PRD 8.11). A personal render switch — same category
 * as a sort order, NOT a permission — so the List rendering is passed in untouched as
 * children and the Kanban/Calendar are built from the SAME already-scoped `tasks`. The choice
 * persists per surface in localStorage so it survives navigation, like a sort preference.
 */
export function TaskViews({
  surfacePath,
  tasks,
  todayKey,
  sprintFilterEnabled = false,
  showFilters = true,
  kind = "task",
  kanbanView,
  focusSprint,
  extraView,
  children,
}: {
  surfacePath: string;
  tasks: ViewTask[];
  todayKey: string;
  /** When true (a scope with Sprint Workflow enabled), the Kanban gets an optional
   * "Active Sprint only" filter (PRD 8.14). Invisible everywhere else. */
  sprintFilterEnabled?: boolean;
  /** Show the built-in Kanban/Calendar filter row. A surface that filters the whole page on the
   * server (My Tasks) turns it off so there is one set of filters, not two. */
  showFilters?: boolean;
  /** "bug" words the Kanban columns for bugs (Open / In Progress / Ready for Retest / Closed). */
  kind?: "task" | "bug";
  /** Replaces the single Kanban board with a surface-specific one (the Bugs page shows one board per
   * project). Server-rendered node; it receives no filters of its own. */
  kanbanView?: React.ReactNode;
  /** Sprint-wise board (final build): when set, the whole view collapses to a single Kanban
   * scoped to just this sprint's tasks — opened from a Sprint card. The view toggle and the
   * "Active Sprint only" filter step aside; a banner links back to the full board. */
  focusSprint?: { id: string; name: string };
  /** An extra, surface-specific view rendered as its own toggle option (server-rendered node).
   * Used by My Tasks for the Today/Tomorrow/This Week bucketed view — omitted everywhere else,
   * so no other surface gains the option. */
  extraView?: { mode: string; label: string; content: React.ReactNode };
  children: React.ReactNode;
}) {
  const storageKey = `gsb:view:${surfacePath}`;
  const [mode, setMode] = useState<string>("list");
  const [activeSprintOnly, setActiveSprintOnly] = useState(false);
  const [filters, setFilters] = useState<BoardFilters>(NO_FILTERS);
  const setFilter = (key: keyof BoardFilters, value: string) => setFilters((f) => ({ ...f, [key]: value }));

  const toggleOptions: { mode: string; label: string }[] = extraView
    ? [...TOGGLE, { mode: extraView.mode, label: extraView.label }]
    : TOGGLE;

  useEffect(() => {
    // Hydrate the saved preference after mount — localStorage isn't readable during SSR, so
    // this necessarily syncs an external store into state once on the client. Guarded to the
    // modes valid on THIS surface, so a stale value (e.g. an extra view no longer present)
    // falls back to List.
    const saved = window.localStorage.getItem(storageKey);
    const valid = new Set(toggleOptions.map((o) => o.mode));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved && valid.has(saved)) setMode(saved);
    // toggleOptions is derived from the stable extraView prop; storageKey keys the surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function choose(m: string) {
    setMode(m);
    window.localStorage.setItem(storageKey, m);
  }

  // Sprint-wise board (final build): scope the whole Kanban to one sprint and step the normal
  // toggle/filter aside. A banner names the sprint and links back to the full board.
  if (focusSprint) {
    const sprintTasks = tasks.filter((t) => t.sprintId === focusSprint.id);
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gs-gray/15 bg-gs-light px-4 py-2.5">
          <p className="text-sm">
            <span className="text-gs-gray">Sprint board · </span>
            <span className="font-semibold">{focusSprint.name}</span>
            <span className="text-gs-gray"> · {sprintTasks.length} task{sprintTasks.length === 1 ? "" : "s"}</span>
          </p>
          <Link href={surfacePath} className="text-sm font-medium text-gs-red hover:underline">
            ← Back to full board
          </Link>
        </div>
        <KanbanBoard tasks={sprintTasks} surfacePath={surfacePath} />
      </div>
    );
  }

  // Board filters (QA D-05) — shared by Kanban and Calendar, applied instantly as they change
  // (QA D-06: no Apply button). They only narrow what is drawn; visibility is decided server-side.
  const filteredTasks = tasks.filter(
    (t) =>
      (filters.status === "all" ||
        (filters.status === "open" ? t.status !== "COMPLETED" : t.status === filters.status)) &&
      (filters.priority === "all" || t.priority === filters.priority) &&
      (filters.type === "all" || t.taskType === filters.type) &&
      (filters.owner === "all" || t.assigneeName === filters.owner) &&
      (filters.project === "all" || t.projectName === filters.project),
  );
  const ownerOptions = Array.from(new Set(tasks.map((t) => t.assigneeName).filter((n): n is string => !!n))).sort();
  const projectOptions = Array.from(new Set(tasks.map((t) => t.projectName).filter((n): n is string => !!n))).sort();
  const hasBugs = tasks.some((t) => t.taskType === "BUG");
  const filtersActive = Object.values(filters).some((v) => v !== "all");

  // "Active Sprint only" applies to the Kanban only (PRD 8.14) and only where Sprint Workflow
  // is enabled; off by default so the board reads exactly as it does today everywhere else.
  const kanbanTasks =
    sprintFilterEnabled && activeSprintOnly ? filteredTasks.filter((t) => t.inActiveSprint) : filteredTasks;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-gs-black/[0.06] p-1">
          {toggleOptions.map((o) => (
            <button
              key={o.mode}
              type="button"
              onClick={() => choose(o.mode)}
              aria-pressed={mode === o.mode}
              className={`min-h-8 rounded-md px-3.5 text-[13px] font-medium transition-all duration-200 ${mode === o.mode ? "bg-white text-gs-black shadow-sm" : "text-gs-gray hover:text-gs-black"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {sprintFilterEnabled && mode === "kanban" && (
          <label className="inline-flex items-center gap-2 text-xs text-gs-gray">
            <input
              type="checkbox"
              checked={activeSprintOnly}
              onChange={(e) => setActiveSprintOnly(e.target.checked)}
              className="h-4 w-4 rounded border-gs-gray/40"
            />
            Active Sprint only
          </label>
        )}
        {showFilters && (mode === "kanban" || mode === "calendar") && (
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(v) => setFilter("status", v)}
              options={[
                ["all", "All statuses"],
                ["open", "Open (not completed)"],
                ["COMPLETED", "Completed"],
                ["NEW", "New"],
                ["IN_PROGRESS", "In Progress"],
                ["REVIEW", "Review"],
                ["ON_HOLD", "On Hold"],
              ]}
            />
            <FilterSelect
              label="Priority"
              value={filters.priority}
              onChange={(v) => setFilter("priority", v)}
              options={[
                ["all", "All priorities"],
                ["URGENT", "Urgent"],
                ["HIGH", "High"],
                ["MEDIUM", "Medium"],
                ["LOW", "Low"],
              ]}
            />
            {hasBugs && (
              <FilterSelect
                label="Type"
                value={filters.type}
                onChange={(v) => setFilter("type", v)}
                options={[
                  ["all", "All types"],
                  ["STANDARD", "Tasks"],
                  ["BUG", "Bugs"],
                ]}
              />
            )}
            {ownerOptions.length > 1 && (
              <FilterSelect
                label="Owner"
                value={filters.owner}
                onChange={(v) => setFilter("owner", v)}
                options={[["all", "All owners"], ...ownerOptions.map((n): [string, string] => [n, n])]}
              />
            )}
            {projectOptions.length > 1 && (
              <FilterSelect
                label="Project"
                value={filters.project}
                onChange={(v) => setFilter("project", v)}
                options={[["all", "All projects"], ...projectOptions.map((n): [string, string] => [n, n])]}
              />
            )}
            {filtersActive && (
              <button type="button" onClick={() => setFilters(NO_FILTERS)} className="text-xs font-medium text-gs-red hover:underline">
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      <div key={mode} className="view-enter">
        {mode === "list" && children}
        {mode === "kanban" && (kanbanView ?? <KanbanBoard tasks={kanbanTasks} surfacePath={surfacePath} kind={kind} />)}
        {mode === "calendar" && <CalendarView tasks={filteredTasks} todayKey={todayKey} />}
        {extraView && mode === extraView.mode && extraView.content}
      </div>
    </div>
  );
}
