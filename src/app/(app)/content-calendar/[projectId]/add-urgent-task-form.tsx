"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { DateInput } from "@/components/date-input";
import { Select } from "@/components/select";

export type UrgentTeam = {
  groupId: string;
  /** "Content" or "Design". */
  name: string;
  /** The team's Lead, who receives the task. */
  leadName: string;
};

/** Today in the browser's own calendar day: only a hint for the pickers; the server checks again. */
function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * "Add urgent task" for the Social Media Cluster Head: a title, the date it belongs on in the calendar, an optional
 * separate due date, an optional Content Type, and one or more teams (Content and/or Design). Each chosen team gets its
 * own task, assigned straight to that team's Lead.
 */
export function AddUrgentTaskForm({
  teams,
  contentTypes,
  action,
}: {
  teams: UrgentTeam[];
  contentTypes: { id: string; name: string }[];
  action: (formData: FormData) => void;
}) {
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [publishDate, setPublishDate] = useState("");

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ActionForm
      action={action}
      successMessage="Urgent task added."
      onSuccess={() => {
        setChosen(new Set());
        setPublishDate("");
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="urgent-title" className="text-sm font-medium">
          Topic/Title <span className="text-gs-red">*</span>
        </label>
        <input id="urgent-title" name="title" required className="field" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="urgent-description" className="text-sm font-medium">Description</label>
        <textarea
          id="urgent-description"
          name="description"
          rows={4}
          placeholder="What is needed, any links or references, and why it is urgent."
          className="field min-h-24 resize-y"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="urgent-publish" className="text-sm font-medium">
            Calendar date <span className="text-gs-red">*</span>
          </label>
          <DateInput
            id="urgent-publish"
            name="publishDate"
            required
            min={todayString()}
            value={publishDate}
            onValueChange={(v) => setPublishDate(v)}
            className="field"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="urgent-due" className="text-sm font-medium">Due date</label>
          <DateInput id="urgent-due" name="dueDate" min={todayString()} className="field" />
          <p className="text-xs text-gs-gray">Leave empty to use the calendar date.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="urgent-type" className="text-sm font-medium">Content Type</label>
          <Select id="urgent-type" name="contentTypeId" defaultValue="" className="field">
            <option value="">None</option>
            {contentTypes.map((ct) => (
              <option key={ct.id} value={ct.id}>{ct.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">
          Teams <span className="text-gs-red">*</span>
          <span className="ml-2 text-xs font-normal text-gs-gray">Choose one or both: each gets its own task.</span>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {teams.map((t) => {
            const on = chosen.has(t.groupId);
            return (
              <div
                key={t.groupId}
                className={`rounded-xl border p-3 transition-colors ${on ? "border-gs-red/40 bg-gs-red/5" : "border-gs-gray/15 bg-white"}`}
              >
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                  <input
                    type="checkbox"
                    name="groupId"
                    value={t.groupId}
                    checked={on}
                    onChange={() => toggle(t.groupId)}
                    className="h-4 w-4"
                  />
                  {t.name} team
                </label>
                <p className="mt-2 pl-[26px] text-xs text-gs-gray">
                  Goes to the team Lead: <span className="font-medium text-gs-black">{t.leadName}</span>
                </p>
              </div>
            );
          })}
        </div>
      </fieldset>

      <SubmitButton pendingLabel="Adding…" className="btn btn-primary self-start">
        Add urgent task
      </SubmitButton>
    </ActionForm>
  );
}
