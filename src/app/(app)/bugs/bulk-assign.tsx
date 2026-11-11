"use client";

import { createContext, useContext, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Select } from "@/components/select";
import { assignBugsAcrossProjects } from "@/lib/actions/bug-assign";

type Ctx = {
  selected: Set<string>;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean) => void;
};
const BulkCtx = createContext<Ctx | null>(null);

/**
 * Bulk assign on the Bugs page: tick bugs in the list (across projects), then pick a team member in the bar that
 * appears. The server checks every bug — you must lead its team, it must be open, and the person must be on that
 * team — and reports any it skipped.
 */
export function BulkAssignProvider({
  assignees,
  children,
}: {
  assignees: { id: string; name: string }[];
  children: React.ReactNode;
}) {
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

  return (
    <BulkCtx.Provider value={ctx}>
      {children}
      {n > 0 && (
        <ActionForm
          action={assignBugsAcrossProjects}
          successMessage="Bugs assigned."
          onSuccess={() => setSelected(new Set())}
          className="anim-pop sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-gs-gray/15 bg-white/95 px-4 py-3 shadow-lg backdrop-blur"
        >
          {Array.from(selected).map((id) => (
            <input key={id} type="hidden" name="taskId" value={id} />
          ))}
          <span className="text-sm font-medium">
            {n} {n === 1 ? "bug" : "bugs"} selected
          </span>
          <Select name="assignedToId" required defaultValue="" className="field field-sm min-w-52" aria-label="Assign to">
            <option value="" disabled>Assign to…</option>
            {assignees.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
          <SubmitButton pendingLabel="Assigning…" className="btn btn-primary btn-sm">
            Assign {n === 1 ? "bug" : "bugs"}
          </SubmitButton>
          <button type="button" onClick={() => setSelected(new Set())} className="text-sm text-gs-gray hover:text-gs-black hover:underline">
            Clear selection
          </button>
        </ActionForm>
      )}
    </BulkCtx.Provider>
  );
}

/** Checkbox at the start of an assignable bug's row. */
export function BugSelect({ id, name }: { id: string; name: string }) {
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

/** Header checkbox: selects every assignable bug in one project's table. */
export function BugSelectAll({ ids }: { ids: string[] }) {
  const ctx = useContext(BulkCtx);
  if (!ctx || ids.length === 0) return null;
  const all = ids.every((id) => ctx.selected.has(id));
  return (
    <input
      type="checkbox"
      checked={all}
      onChange={() => ctx.setMany(ids, !all)}
      aria-label="Select all assignable bugs in this project"
      className="h-4 w-4"
    />
  );
}
