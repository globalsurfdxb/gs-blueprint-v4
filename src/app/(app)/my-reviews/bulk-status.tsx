"use client";

import { createContext, useContext, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Select } from "@/components/select";
import { changeStatusInBulk } from "@/lib/actions/task-status";

type Ctx = { selected: Set<string>; toggle: (id: string) => void; setMany: (ids: string[], on: boolean) => void };
const BulkCtx = createContext<Ctx | null>(null);

/**
 * Bulk status change on the review list: tick tasks, choose a status in the bar that appears, apply. The server runs
 * each task through the normal single-move rules and reports any it skipped.
 */
export function BulkStatusProvider({ surfacePath, children }: { surfacePath: string; children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ctx: Ctx = {
    selected,
    toggle: (id) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    setMany: (ids, on) =>
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (on) next.add(id);
          else next.delete(id);
        }
        return next;
      }),
  };
  const n = selected.size;
  const action = changeStatusInBulk.bind(null, surfacePath);

  return (
    <BulkCtx.Provider value={ctx}>
      {children}
      {n > 0 && (
        <ActionForm
          action={action}
          successMessage="Status updated."
          onSuccess={() => setSelected(new Set())}
          className="anim-pop sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-gs-gray/15 bg-white/95 px-4 py-3 shadow-lg backdrop-blur"
        >
          {Array.from(selected).map((id) => (
            <input key={id} type="hidden" name="taskId" value={id} />
          ))}
          <span className="text-sm font-medium">
            {n} {n === 1 ? "task" : "tasks"} selected
          </span>
          <Select name="targetStatus" required defaultValue="" className="field field-sm min-w-56" aria-label="Move to status">
            <option value="" disabled>Move to…</option>
            <option value="COMPLETED">Completed (approve)</option>
            <option value="IN_PROGRESS">In Progress (send back / start)</option>
            <option value="REVIEW">Review (submit)</option>
          </Select>
          <SubmitButton pendingLabel="Updating…" className="btn btn-primary btn-sm">
            Apply to {n === 1 ? "task" : "tasks"}
          </SubmitButton>
          <button type="button" onClick={() => setSelected(new Set())} className="text-sm text-gs-gray hover:text-gs-black hover:underline">
            Clear selection
          </button>
          <p className="w-full text-xs text-gs-gray">
            Each task is checked on its own — ones that can&apos;t make that move are skipped and you&apos;ll be told why.
          </p>
        </ActionForm>
      )}
    </BulkCtx.Provider>
  );
}

export function RowSelect({ id, name }: { id: string; name: string }) {
  const ctx = useContext(BulkCtx);
  if (!ctx) return null;
  return (
    <input
      type="checkbox"
      checked={ctx.selected.has(id)}
      onChange={() => ctx.toggle(id)}
      aria-label={`Select ${name}`}
      className="h-4 w-4"
    />
  );
}

export function SelectAll({ ids }: { ids: string[] }) {
  const ctx = useContext(BulkCtx);
  if (!ctx || ids.length === 0) return null;
  const all = ids.every((id) => ctx.selected.has(id));
  return (
    <input
      type="checkbox"
      checked={all}
      onChange={() => ctx.setMany(ids, !all)}
      aria-label="Select every task in this project"
      className="h-4 w-4"
    />
  );
}
