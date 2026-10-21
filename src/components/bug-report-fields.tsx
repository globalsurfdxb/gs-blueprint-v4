"use client";

import { SEVERITY_VALUES, SEVERITY_LABELS, ENVIRONMENT_VALUES, ENVIRONMENT_LABELS } from "@/lib/bug";
import { Select } from "@/components/select";
import type { TaskCreateOptions } from "@/lib/actions/task-create";

const fieldClass = "field";

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
  initialBugSprintId,
}: {
  leadId: string;
  leadName: string;
  bugSprints: TaskCreateOptions["bugSprints"];
  initialBugSprintId: string | null;
}) {
  return (
    <>
      <input type="hidden" name="taskType" value="BUG" />
      <input type="hidden" name="assignedToId" value={leadId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bug-title" className="text-sm font-medium">What&apos;s the bug?</label>
        <input id="bug-title" name="name" required placeholder="Short summary, e.g. Checkout button does nothing" className={fieldClass} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="severity" className="text-sm font-medium">Severity</label>
          <Select id="severity" name="severity" required defaultValue="" className={fieldClass}>
            <option value="" disabled>Select</option>
            {SEVERITY_VALUES.map((s) => (
              <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="environment" className="text-sm font-medium">Where</label>
          <Select id="environment" name="environment" required defaultValue="" className={fieldClass}>
            <option value="" disabled>Select</option>
            {ENVIRONMENT_VALUES.map((e) => (
              <option key={e} value={e}>{ENVIRONMENT_LABELS[e]}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="stepsToReproduce" className="text-sm font-medium">
          What happened? <span className="text-gs-gray">(optional)</span>
        </label>
        <textarea
          id="stepsToReproduce"
          name="stepsToReproduce"
          rows={3}
          placeholder="Steps to reproduce, what you expected, what you saw"
          className={fieldClass}
        />
      </div>

      {bugSprints.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="create-bug-sprint" className="text-sm font-medium">
            Bug sprint <span className="text-gs-gray">(optional)</span>
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

      <details className="rounded-md border border-gs-gray/20 bg-gs-light/40 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-gs-gray hover:text-gs-black">Add screenshots or a link</summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bugImages" className="text-xs font-medium">Screenshots</label>
            <input
              id="bugImages"
              type="file"
              name="image"
              multiple
              accept="image/png,image/jpeg,image/webp"
              className="text-xs file:mr-2 file:rounded-md file:border file:border-gs-gray/30 file:bg-gs-light file:px-3 file:py-1.5 file:text-xs file:font-medium"
            />
            <p className="text-xs text-gs-gray">PNG, JPG or WebP · up to 3 images · 5MB each.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="screenshotLink" className="text-xs font-medium">Or a link</label>
            <input id="screenshotLink" name="screenshotLink" type="url" placeholder="https://…" className={fieldClass} />
          </div>
        </div>
      </details>

      <p className="text-xs text-gs-gray">
        Goes to {leadName} (group Lead) to triage and assign. Priority follows severity.
      </p>
    </>
  );
}
