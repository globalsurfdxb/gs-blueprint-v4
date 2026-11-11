"use client";

import { useState } from "react";
import { SEVERITY_VALUES, SEVERITY_LABELS, ENVIRONMENT_VALUES, ENVIRONMENT_LABELS } from "@/lib/bug";
import { Select } from "@/components/select";
import type { TaskCreateOptions } from "@/lib/actions/task-create";

const fieldClass = "field";
const labelClass = "text-[13px] font-medium text-gs-black/80";

/**
 * The short "Report a bug" form: what it is, how bad, where, what happened — and nothing else up front.
 * Screenshots live behind one disclosure. Everything the server needs but the reporter shouldn't have to
 * think about is filled in for them: the group Lead is the assignee (bugs are triaged first), priority
 * follows severity, and the due date follows the bug sprint (or a week out).
 */
export function BugReportFields({
  leadId,
  leadName,
  bugSprints,
  pages,
  defaultPageId,
  initialBugSprintId,
}: {
  leadId: string;
  leadName: string;
  bugSprints: TaskCreateOptions["bugSprints"];
  pages: TaskCreateOptions["pages"];
  defaultPageId: string | null;
  initialBugSprintId: string | null;
}) {
  // "" = no page, "__new__" = type a new page's name and address, otherwise an existing page's id.
  const [pageChoice, setPageChoice] = useState<string>(() =>
    defaultPageId && pages.some((p) => p.id === defaultPageId) ? defaultPageId : "",
  );
  const [linkRows, setLinkRows] = useState(1);

  return (
    <>
      <input type="hidden" name="taskType" value="BUG" />
      <input type="hidden" name="assignedToId" value={leadId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bug-title" className={labelClass}>What&apos;s the bug? <span className="text-gs-red">*</span></label>
        <input id="bug-title" name="name" required placeholder="Short summary, e.g. Checkout button does nothing" className={fieldClass} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="severity" className={labelClass}>Severity <span className="text-gs-red">*</span></label>
          <Select id="severity" name="severity" required defaultValue="" className={fieldClass}>
            <option value="" disabled>Select</option>
            {SEVERITY_VALUES.map((s) => (
              <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="environment" className={labelClass}>Where <span className="text-gs-red">*</span></label>
          <Select id="environment" name="environment" required defaultValue="" className={fieldClass}>
            <option value="" disabled>Select</option>
            {ENVIRONMENT_VALUES.map((e) => (
              <option key={e} value={e}>{ENVIRONMENT_LABELS[e]}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bug-page" className={labelClass}>
          Page <span className="font-normal text-gs-gray">(where did you see it?)</span>
        </label>
        <Select
          id="bug-page"
          value={pageChoice}
          onChange={(e) => setPageChoice(e.target.value)}
          // Only an existing page's id is sent under pageId; "new" is expressed by the name/address fields below.
          name={pageChoice === "__new__" ? undefined : "pageId"}
          className={fieldClass}
        >
          <option value="">No specific page</option>
          {pages.map((p) => (
            <option key={p.id} value={p.id} data-sub={p.url}>{p.name}</option>
          ))}
          <option value="__new__">+ Add a new page…</option>
        </Select>
        {pageChoice === "__new__" && (
          <div className="mt-1 grid gap-2 rounded-lg border border-gs-gray/20 bg-gs-light/40 p-3 sm:grid-cols-2">
            <input name="newPageName" required placeholder="Page name, e.g. Contact" aria-label="New page name" className={fieldClass} />
            <input name="newPageUrl" type="url" required placeholder="https://…" aria-label="New page address" className={fieldClass} />
            <p className="text-xs text-gs-gray sm:col-span-2">Saved to this project&apos;s pages, so the next bug can pick it.</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="stepsToReproduce" className={labelClass}>
          What happened? <span className="font-normal text-gs-gray">(optional)</span>
        </label>
        <textarea
          id="stepsToReproduce"
          name="stepsToReproduce"
          rows={4}
          placeholder="Steps to reproduce, what you expected, what you saw"
          className={fieldClass}
        />
      </div>

      {bugSprints.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="create-bug-sprint" className={labelClass}>
            Bug sprint <span className="font-normal text-gs-gray">(optional)</span>
          </label>
          <Select
            id="create-bug-sprint"
            name="bugSprintId"
            defaultValue={bugSprints.some((b) => b.id === initialBugSprintId) ? initialBugSprintId ?? "" : ""}
            className={fieldClass}
          >
            <option value="">Not in a bug sprint</option>
            {bugSprints.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · due {new Date(b.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className={labelClass}>
          Screenshot links <span className="font-normal text-gs-gray">(optional)</span>
        </span>
        {Array.from({ length: linkRows }, (_, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <input
              name="screenshotLabel"
              aria-label={`Screenshot name ${i + 1}`}
              placeholder="Name (optional)"
              className={fieldClass}
            />
            <input
              name="screenshotLink"
              type="url"
              aria-label={`Screenshot link ${i + 1}`}
              placeholder="https://…"
              className={fieldClass}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLinkRows((n) => n + 1)}
          className="self-start text-sm font-medium text-gs-red hover:underline"
        >
          + Add another link
        </button>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3.5 py-3 text-xs leading-relaxed text-sky-800">
        <span aria-hidden className="mt-px font-semibold">ⓘ</span>
        <span>Goes to {leadName} (group Lead) to triage and assign. Priority follows severity.</span>
      </p>
    </>
  );
}
