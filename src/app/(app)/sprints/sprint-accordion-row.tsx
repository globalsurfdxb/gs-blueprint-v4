"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TaskStatusChip } from "@/components/task-chips";
import { TaskOpener, useTaskDrawer } from "@/components/task-drawer";
import { TaskChecklist } from "@/app/(app)/projects/[id]/sprints-section";
import { getSprintPanel, type SprintPanelData } from "@/lib/actions/sprint-panel";
import { addTasksToSprint } from "@/lib/actions/sprints";
import { isFailure, readableError } from "@/lib/action-result";

/**
 * A sprint row on the Sprints page that opens like an accordion: click the row to reveal its tasks and, below them, the
 * two ways to put work into the sprint — "+ New task in this sprint" (the create panel with the sprint preselected) and
 * "+ Add existing tasks" (pick from backlog / other open sprints). The panel loads when first opened.
 */
export function SprintAccordionRow({
  sprint,
  colSpan,
  children,
}: {
  sprint: { id: string; name: string; projectId: string; status: "PLANNED" | "ACTIVE" | "COMPLETED" };
  /** Columns in the table (the panel spans all of them, including the chevron column). */
  colSpan: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);

  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`${open ? "Collapse" : "Expand"} ${sprint.name}`}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className={`group cursor-pointer border-t border-gs-gray/10 transition-colors hover:bg-gs-red/[0.04] focus-visible:bg-gs-red/[0.06] ${open ? "bg-gs-light/50" : ""}`}
      >
        {children}
        <td className="w-8 pr-4 text-right align-middle" aria-hidden>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`inline h-4 w-4 text-gs-gray transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          >
            <path d="M8 5l5 5-5 5" />
          </svg>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-gs-gray/10 bg-gs-light/30">
          <td colSpan={colSpan} className="px-4 py-4">
            <SprintPanelBody sprint={sprint} />
          </td>
        </tr>
      )}
    </>
  );
}

function SprintPanelBody({ sprint }: { sprint: { id: string; name: string; projectId: string; status: string } }) {
  const [data, setData] = useState<SprintPanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const drawer = useTaskDrawer();
  const router = useRouter();

  // Bumping `reload` re-fetches the panel (after adding tasks, or when a task is created from the drawer).
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getSprintPanel(sprint.id);
        if (cancelled) return;
        if (isFailure(result)) setError(result.error);
        else {
          setError(null);
          setData(result);
        }
      } catch (e) {
        if (!cancelled) setError(readableError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sprint.id, reload]);

  useEffect(() => {
    // A task created from the drawer (with this sprint preselected) should appear here straight away.
    const onCreated = () => setReload((n) => n + 1);
    window.addEventListener("gs:task-created", onCreated);
    return () => window.removeEventListener("gs:task-created", onCreated);
  }, []);

  if (error) return <p role="alert" className="text-sm text-gs-red">{error}</p>;
  if (!data) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <div className="h-8 w-56 animate-pulse rounded-md bg-gs-gray/10" />
        <div className="h-9 animate-pulse rounded-md bg-gs-gray/10" />
        <div className="h-9 animate-pulse rounded-md bg-gs-gray/10" />
      </div>
    );
  }

  const addWithId = addTasksToSprint.bind(null, sprint.id);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {data.canCreateTask && drawer && (
          <button
            type="button"
            onClick={() => drawer.openCreate(sprint.projectId, undefined, { sprintId: sprint.id })}
            className="btn btn-primary btn-sm"
          >
            + New task in this sprint
          </button>
        )}
        {data.candidates.length > 0 && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn btn-secondary btn-sm">
            + Add existing tasks
          </button>
        )}
        <Link
          href={`/projects/${sprint.projectId}?tab=sprints&sprint=${sprint.id}`}
          className="ml-auto text-sm font-medium text-gs-red hover:underline"
        >
          Open board →
        </Link>
      </div>

      {adding && (
        <ActionForm
          action={addWithId}
          successMessage="Added to sprint."
          onSuccess={() => {
            setAdding(false);
            setReload((n) => n + 1);
            router.refresh();
          }}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Add existing tasks to this sprint</p>
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-gs-gray hover:text-gs-black hover:underline">
              Cancel
            </button>
          </div>
          <TaskChecklist
            candidates={data.candidates}
            footer={(n) => (
              <SubmitButton pendingLabel="Adding…" className="btn btn-primary btn-sm">
                {n > 0 ? `Add ${n} ${n === 1 ? "task" : "tasks"}` : "Add tasks"}
              </SubmitButton>
            )}
          />
        </ActionForm>
      )}

      {data.tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gs-gray/30 bg-white px-4 py-5 text-sm text-gs-gray">
          No tasks in this sprint yet.
        </p>
      ) : (
        <ul className="max-h-72 divide-y divide-gs-gray/10 overflow-y-auto rounded-lg border border-gs-gray/15 bg-white">
          {data.tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              <TaskOpener taskId={t.id} projectId={sprint.projectId} className="min-w-0 truncate text-left font-medium hover:text-gs-red hover:underline">
                {t.name}
              </TaskOpener>
              <span className="flex shrink-0 items-center gap-3 text-xs text-gs-gray">
                {t.assigneeName ?? "Unassigned"}
                <TaskStatusChip status={t.status} label={t.statusLabel} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
