"use client";

import { useTaskType } from "./task-type-context";
import { Select } from "@/components/select";

const fieldClass =
  "field";

/**
 * Assigned To field. Normally a picker of the eligible assignees. For a Bug (v1.24, only
 * possible in a Bug-Tracking group) the assignee is forced to the group's Lead for triage, so
 * the picker is replaced by a read-only note and a hidden Lead id — the server enforces this
 * regardless, this just keeps the UI honest rather than showing a misleading self-assignment.
 */
export function AssigneeField({
  assignees,
  leadId,
  leadName,
  bugTrackingEnabled,
}: {
  assignees: { id: string; name: string }[];
  leadId: string;
  leadName: string;
  bugTrackingEnabled: boolean;
}) {
  const { taskType } = useTaskType();
  const isBug = bugTrackingEnabled && taskType === "BUG";

  if (isBug) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Assigned To</span>
        <input type="hidden" name="assignedToId" value={leadId} />
        <div className="rounded-md border border-gs-gray/25 bg-gs-light px-3 py-2 text-sm">
          {leadName} <span className="text-gs-gray">· group Lead</span>
        </div>
        <p className="text-xs text-gs-gray">
          Bugs are triaged by the group Lead first — they&apos;ll reassign it to a developer.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="assignedToId" className="text-sm font-medium">Assigned To</label>
      {/* defaultValue="" keeps the placeholder selected: without it the browser silently picks the
          first listed person (usually the Lead), so tasks were assigned by accident (QA F-05). */}
      <Select id="assignedToId" name="assignedToId" required defaultValue="" className={fieldClass}>
        <option value="" disabled>Select one person</option>
        {assignees.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </Select>
      <p className="text-xs text-gs-gray">Every task has exactly one owner — no multi-assignee tasks.</p>
    </div>
  );
}
