"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";

type PageRow = { id: string; name: string; url: string; bugCount: number; addedBy: string };

/**
 * The project's site pages (name + address). Managers add several at once and edit or remove them; everyone on the
 * project can open them. A bug can be filed against one of these pages — the reporter picks it, or adds a new page
 * right in the bug form.
 */
export function ProjectPagesSection({
  pages,
  canManage,
  addAction,
  updateAction,
  deleteAction,
}: {
  pages: PageRow[];
  canManage: boolean;
  addAction: (formData: FormData) => void;
  updateAction: (pageId: string, formData: FormData) => void;
  deleteAction: (pageId: string, formData: FormData) => void;
}) {
  const [rowCount, setRowCount] = useState(1);
  const [formKey, setFormKey] = useState(0); // remount to clear the rows after a successful add
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      {canManage && (
        <section className="rounded-xl border border-gs-gray/10 bg-white p-5 shadow-sm">
          <h2 className="font-heading text-base font-semibold tracking-tight">Add pages</h2>
          <p className="mt-0.5 text-sm text-gs-gray">
            List the pages of this project&apos;s site. Leave the name blank to use the end of the address.
          </p>
          <ActionForm
            key={formKey}
            action={addAction}
            successMessage="Pages added."
            onSuccess={() => {
              setRowCount(1);
              setFormKey((k) => k + 1);
            }}
            className="mt-4 flex flex-col gap-3"
          >
            {Array.from({ length: rowCount }, (_, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <input name="pageName" aria-label={`Page name ${i + 1}`} placeholder="Page name, e.g. Contact" className="field" />
                <input name="pageUrl" type="url" aria-label={`Page address ${i + 1}`} placeholder="https://…" className="field" />
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton pendingLabel="Adding…" className="btn btn-primary btn-sm">
                Add {rowCount === 1 ? "page" : "pages"}
              </SubmitButton>
              <button type="button" onClick={() => setRowCount((n) => n + 1)} className="text-sm font-medium text-gs-red hover:underline">
                + Add another page
              </button>
            </div>
          </ActionForm>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm">
        <h2 className="flex items-center gap-2.5 border-b border-gs-gray/10 px-5 py-4 font-heading text-base font-semibold tracking-tight">
          Pages
          <span className="rounded-full bg-gs-light px-2 py-0.5 text-xs font-semibold tabular-nums text-gs-gray">{pages.length}</span>
        </h2>
        {pages.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gs-gray">
            No pages yet.{canManage ? " Add them above, or whoever reports a bug can add one while reporting." : ""}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-gs-gray/10 bg-gs-light/40 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray/80">
                <tr>
                  <th className="whitespace-nowrap px-5 py-2.5">Page</th>
                  <th className="whitespace-nowrap px-4 py-2.5">Address</th>
                  <th className="whitespace-nowrap px-4 py-2.5">Bugs</th>
                  <th className="whitespace-nowrap px-4 py-2.5">Added by</th>
                  {canManage && <th className="px-4 py-2.5" aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {pages.map((p) =>
                  editingId === p.id ? (
                    <tr key={p.id} className="border-t border-gs-gray/10 bg-gs-light/40">
                      <td colSpan={canManage ? 5 : 4} className="px-5 py-3">
                        <ActionForm
                          action={updateAction.bind(null, p.id)}
                          successMessage="Page updated."
                          onSuccess={() => setEditingId(null)}
                          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
                        >
                          <input name="name" required defaultValue={p.name} aria-label="Page name" className="field field-sm" />
                          <input name="url" type="url" required defaultValue={p.url} aria-label="Page address" className="field field-sm" />
                          <div className="flex gap-2">
                            <SubmitButton pendingLabel="Saving…" className="btn btn-primary btn-sm">
                              Save
                            </SubmitButton>
                            <button type="button" onClick={() => setEditingId(null)} className="btn btn-secondary btn-sm">
                              Cancel
                            </button>
                          </div>
                        </ActionForm>
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id} className="border-t border-gs-gray/10">
                      <td className="px-5 py-3 font-medium">{p.name}</td>
                      <td className="max-w-xs px-4 py-3">
                        <a href={p.url} target="_blank" rel="noopener noreferrer" title={p.url} className="block truncate text-gs-red hover:underline">
                          {p.url}
                        </a>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gs-gray">{p.bugCount}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gs-gray">{p.addedBy}</td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button type="button" onClick={() => setEditingId(p.id)} className="text-xs font-medium text-gs-gray hover:text-gs-black hover:underline">
                              Edit
                            </button>
                            <ActionForm action={deleteAction.bind(null, p.id)} successMessage="Page removed.">
                              <button type="submit" className="text-xs font-medium text-gs-red hover:underline">
                                Delete
                              </button>
                            </ActionForm>
                          </div>
                        </td>
                      )}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
