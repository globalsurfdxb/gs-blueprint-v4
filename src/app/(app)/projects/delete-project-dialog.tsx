"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type DeleteAction = (prevState: { error?: string } | undefined, formData: FormData) => Promise<{ error?: string }>;

/**
 * Admin-only "Delete project" with a confirm dialog: the Admin must type the project's exact name, and the server
 * action re-checks both that and the Admin role. Works from the Projects list (small trash icon) and from the
 * project page header (full button). Archiving is offered as the way to keep history instead.
 */
export function DeleteProjectDialog({
  projectName,
  summary = "its tasks, time logs, comments, links, sprints and milestones",
  action,
  variant = "icon",
}: {
  projectName: string;
  summary?: string;
  action: DeleteAction;
  variant?: "icon" | "button";
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, formAction, pending] = useActionState(action, undefined);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending]);

  function close() {
    setOpen(false);
    setTyped("");
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Delete ${projectName}`}
          title="Delete project"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gs-gray/70 transition-colors hover:bg-gs-red/10 hover:text-gs-red"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
          </svg>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="btn btn-danger">
          Delete project
        </button>
      )}

      {open &&
        createPortal(
          // Stop clicks reaching a clickable table row underneath (React events bubble through portals).
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Delete ${projectName}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="anim-fade-in absolute inset-0 bg-black/40" onClick={() => !pending && close()} aria-hidden />
            <form
              action={formAction}
              className="anim-pop relative z-10 flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-6 shadow-lg"
            >
              <div>
                <h2 className="font-heading text-lg font-semibold">Delete this project?</h2>
                <p className="mt-2 text-sm leading-relaxed text-gs-gray">
                  This permanently deletes <strong className="text-gs-black">{projectName}</strong> and everything attached to it:{" "}
                  {summary}. It cannot be undone — archive the project instead if you want to keep its history.
                </p>
              </div>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Type the project name to confirm
                <input
                  name="confirmName"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  placeholder={projectName}
                  className="field font-normal"
                />
              </label>
              {state?.error && (
                <p role="alert" className="text-sm text-gs-red">
                  {state.error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" disabled={pending} onClick={close} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={pending || typed.trim() !== projectName} className="btn btn-primary">
                  {pending ? "Deleting…" : "Delete permanently"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
