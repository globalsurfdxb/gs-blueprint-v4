"use client";

import { SEVERITY_VALUES, SEVERITY_LABELS, ENVIRONMENT_VALUES, ENVIRONMENT_LABELS } from "@/lib/bug";
import { useTaskType } from "./task-type-context";
import { Select } from "@/components/select";

const fieldClass =
  "field";

/**
 * Task Type selector + Bug-only fields. Rendered only when the target Task Group's
 * discipline has Bug Tracking enabled (PRD 8.2.4) — every other discipline never sees this,
 * so their create-task screen is unchanged. Severity/Steps/Environment appear only when
 * Task Type = Bug.
 */
export function TaskTypeFields({ lockToBug = false }: { lockToBug?: boolean }) {
  const { taskType, setTaskType } = useTaskType();
  const isBug = lockToBug || taskType === "BUG";

  return (
    <>
      {/* "Report a bug" is always a bug, so there is no Task Type choice to make. */}
      {lockToBug && <input type="hidden" name="taskType" value="BUG" />}
      {!lockToBug && (
      <div className="flex flex-col gap-1.5">
        <label htmlFor="taskType" className="text-sm font-medium">Task Type</label>
        <Select
          id="taskType"
          name="taskType"
          value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
          className={fieldClass}
        >
          <option value="STANDARD">Standard</option>
          <option value="BUG">Bug</option>
        </Select>
        <p className="text-xs text-gs-gray">Set once at creation — a task&apos;s type can&apos;t be changed later.</p>
      </div>
      )}

      {isBug && (
        <div className="flex flex-col gap-4 rounded-md border border-gs-gray/20 bg-gs-light/40 p-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="severity" className="text-sm font-medium">Severity <span className="text-gs-gray">(impact)</span></label>
            <Select id="severity" name="severity" required={isBug} defaultValue="" className={fieldClass}>
              <option value="" disabled>Select severity</option>
              {SEVERITY_VALUES.map((s) => (
                <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="environment" className="text-sm font-medium">Environment</label>
            <Select id="environment" name="environment" required={isBug} defaultValue="" className={fieldClass}>
              <option value="" disabled>Select environment</option>
              {ENVIRONMENT_VALUES.map((e) => (
                <option key={e} value={e}>{ENVIRONMENT_LABELS[e]}</option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="stepsToReproduce" className="text-sm font-medium">
              Steps to Reproduce <span className="text-gs-gray">(optional)</span>
            </label>
            <textarea id="stepsToReproduce" name="stepsToReproduce" rows={3} className={fieldClass} />
          </div>

          {/* Evidence: upload up to 3 screenshots and/or paste a link to one (Loom, Drive, OneDrive…). */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bugImages" className="text-sm font-medium">
              Screenshots <span className="text-gs-gray">(optional)</span>
            </label>
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
            <label htmlFor="screenshotLink" className="text-sm font-medium">
              Screenshot link <span className="text-gs-gray">(optional)</span>
            </label>
            <input
              id="screenshotLink"
              name="screenshotLink"
              type="url"
              placeholder="https://…"
              className={fieldClass}
            />
            <p className="text-xs text-gs-gray">A link to a screenshot or screen recording kept elsewhere.</p>
          </div>
        </div>
      )}
    </>
  );
}
