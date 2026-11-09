"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { getProjectTeam, setProjectTeam, type ProjectTeamData } from "@/lib/actions/project-team";
import { isFailure, noticeOf, readableError } from "@/lib/action-result";

/**
 * "Team" on a project (list row or project header): a Lead, Cluster Head or Admin ticks the people who should be on
 * the project. Members see it in their Projects list and can be given tasks; the server checks both who may do this
 * and that each person is in the caller's pool. The list loads when the dialog opens, so the Projects page stays light.
 */
export function ProjectTeamDialog({
  projectId,
  projectName,
  variant = "icon",
}: {
  projectId: string;
  projectName: string;
  variant?: "icon" | "button";
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ProjectTeamData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [saving, startSave] = useTransition();
  const { addToast } = useToast();
  const router = useRouter();

  async function openDialog() {
    setOpen(true);
    setData(null);
    setLoadError(null);
    setQuery("");
    try {
      const result = await getProjectTeam(projectId);
      if (isFailure(result)) {
        setLoadError(result.error);
        return;
      }
      setData(result);
      setSelected(new Set(result.members.filter((id) => result.candidates.some((c) => c.id === id))));
    } catch (e) {
      setLoadError(readableError(e));
    }
  }

  function close() {
    if (!saving) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, saving]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = data?.candidates ?? [];
    return needle ? list.filter((c) => c.name.toLowerCase().includes(needle) || c.detail.toLowerCase().includes(needle)) : list;
  }, [data, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    startSave(async () => {
      try {
        const result = await setProjectTeam(projectId, Array.from(selected));
        if (isFailure(result)) {
          addToast(result.error, "error");
          return;
        }
        addToast(noticeOf(result) ?? "Team updated.", "success");
        setOpen(false);
        router.refresh();
      } catch (e) {
        addToast(readableError(e), "error");
      }
    });
  }

  const memberCount = selected.size;

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={openDialog}
          aria-label={`Manage team for ${projectName}`}
          title="Manage team"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gs-gray/70 transition-colors hover:bg-gs-black/5 hover:text-gs-black"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.4c2.2.7 3.5 2.5 3.5 5.6" />
          </svg>
        </button>
      ) : (
        <button type="button" onClick={openDialog} className="btn btn-secondary">
          Manage team
        </button>
      )}

      {open &&
        createPortal(
          // Stop clicks reaching a clickable table row underneath (React events bubble through portals).
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Team for ${projectName}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="anim-fade-in absolute inset-0 bg-black/40" onClick={close} aria-hidden />
            <div className="anim-pop relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-lg">
              <div className="border-b border-gs-gray/10 px-6 py-4">
                <h2 className="font-heading text-lg font-semibold">Project team</h2>
                <p className="mt-0.5 text-sm text-gs-gray">
                  Pick who works on <strong className="text-gs-black">{projectName}</strong>. They will see the project in
                  their list and can be given tasks.
                </p>
              </div>

              {loadError ? (
                <p role="alert" className="px-6 py-8 text-sm text-gs-red">
                  {loadError}
                </p>
              ) : !data ? (
                <div className="flex flex-col gap-3 px-6 py-6" aria-busy="true">
                  <div className="h-9 animate-pulse rounded-md bg-gs-gray/10" />
                  <div className="h-9 animate-pulse rounded-md bg-gs-gray/10" />
                  <div className="h-9 animate-pulse rounded-md bg-gs-gray/10" />
                </div>
              ) : (
                <>
                  <div className="px-6 pt-4">
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search people…"
                      aria-label="Search people"
                      autoFocus
                      className="field field-sm w-full"
                    />
                  </div>
                  <ul className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-2">
                    {shown.length === 0 && (
                      <li className="px-3 py-6 text-center text-sm text-gs-gray">
                        {data.candidates.length === 0 ? "There is nobody to add to this project yet." : "No one matches that search."}
                      </li>
                    )}
                    {shown.map((c) => (
                      <li key={c.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gs-light">
                          <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4" />
                          <span
                            aria-hidden
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gs-red/10 text-sm font-semibold text-gs-red"
                          >
                            {c.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{c.name}</span>
                            {c.detail && <span className="block truncate text-xs text-gs-gray">{c.detail}</span>}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-gs-gray/10 px-6 py-3.5">
                <span className="text-sm text-gs-gray">{data ? `${memberCount} selected` : ""}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={close} disabled={saving} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button type="button" onClick={save} disabled={saving || !data} className="btn btn-primary min-w-24">
                    {saving ? "Saving…" : "Save team"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
