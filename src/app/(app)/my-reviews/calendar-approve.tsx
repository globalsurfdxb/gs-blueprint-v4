"use client";

import { useState, useTransition } from "react";
import {
  approveCalendarFinalDelivery,
  approveCalendarHandoffToDesign,
  requestCalendarRevision,
} from "@/lib/actions/task-handoff";
import { isFailure } from "@/lib/action-result";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/toast";

export type CalendarStage = "content" | "design";

/** Runs the same server action the task page's Approve button uses, so the rules are identical. */
function approveOne(taskId: string, stage: CalendarStage) {
  const action = stage === "content" ? approveCalendarHandoffToDesign : approveCalendarFinalDelivery;
  return action(taskId, new FormData());
}

const LABEL: Record<CalendarStage, string> = {
  content: "Approve → Design",
  design: "Approve final delivery",
};

const DONE: Record<CalendarStage, string> = {
  content: "Approved and sent to Design.",
  design: "Final delivery approved.",
};

/** One-click approval for a Content Calendar task, straight from the My Reviews list. */
export function CalendarApproveButton({ taskId, stage, name }: { taskId: string; stage: CalendarStage; name: string }) {
  const { addToast } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      aria-label={`${LABEL[stage]}: ${name}`}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await approveOne(taskId, stage);
            if (isFailure(result)) addToast(result.error, "error");
            else addToast(DONE[stage], "success");
          } catch {
            addToast("Something went wrong. Please try again.", "error");
          }
        })
      }
      className="btn btn-primary btn-sm whitespace-nowrap disabled:opacity-60"
    >
      {pending && <Spinner />}
      {pending ? "Approving…" : LABEL[stage]}
    </button>
  );
}

/** Send a finished post back for revision, with an optional note for the team. */
export function CalendarRevisionButton({ taskId, name }: { taskId: string; name: string }) {
  const { addToast } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      aria-label={`Send back for revision: ${name}`}
      onClick={() => {
        const note = window.prompt(`Send "${name}" back for revision?\n\nWhat needs to change? (optional)`);
        if (note === null) return; // cancelled
        const formData = new FormData();
        formData.set("note", note);
        startTransition(async () => {
          try {
            const result = await requestCalendarRevision(taskId, formData);
            if (isFailure(result)) addToast(result.error, "error");
            else addToast("Sent back for revision.", "success");
          } catch {
            addToast("Something went wrong. Please try again.", "error");
          }
        });
      }}
      className="btn btn-secondary btn-sm whitespace-nowrap disabled:opacity-60"
    >
      {pending && <Spinner />}
      {pending ? "Sending…" : "Revision"}
    </button>
  );
}

/** Approve every waiting task of one project in a single click (each one is still checked on its own). */
export function CalendarApproveAllButton({ items }: { items: { taskId: string; stage: CalendarStage }[] }) {
  const { addToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState(0);

  if (items.length < 2) return null;

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        if (!window.confirm(`Approve all ${items.length} tasks in this project?`)) return;
        startTransition(async () => {
          let ok = 0;
          const errors: string[] = [];
          for (const [i, item] of items.entries()) {
            setProgress(i + 1);
            try {
              const result = await approveOne(item.taskId, item.stage);
              if (isFailure(result)) errors.push(result.error);
              else ok += 1;
            } catch {
              errors.push("Something went wrong.");
            }
          }
          if (ok > 0) addToast(`${ok} ${ok === 1 ? "task" : "tasks"} approved.`, "success");
          if (errors.length > 0) addToast(`${errors.length} could not be approved: ${errors[0]}`, "error");
        });
      }}
      className="btn btn-secondary btn-sm whitespace-nowrap disabled:opacity-60"
    >
      {pending && <Spinner />}
      {pending ? `Approving ${progress}/${items.length}…` : `Approve all (${items.length})`}
    </button>
  );
}
