"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importUsers, type UserImportState } from "@/lib/actions/user-import";

// A route handler (file download), not a page — a plain <a>, not <Link>, so the browser downloads it.
const TEMPLATE_HREF = "/admin/users/export?template=1";

function downloadCredentials(credentials: { name: string; email: string; password: string }[]) {
  const csv = ["Name,Email,Password", ...credentials.map((c) => [c.name, c.email, c.password].map((v) => `"${v.replace(/"/g, '""')}"`).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "imported-user-passwords.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportForm() {
  const [state, formAction, pending] = useActionState<UserImportState, FormData>(importUsers, undefined);

  return (
    <div className="mt-6 flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-gs-gray/15 bg-white p-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="file" className="text-sm font-medium">Users file (.xlsx or .csv)</label>
          <input
            id="file"
            name="file"
            type="file"
            required
            accept=".xlsx,.csv"
            className="text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-gs-gray/30 file:bg-white file:px-4 file:text-sm file:font-medium hover:file:bg-gs-light"
          />
          <p className="text-xs text-gs-gray">
            Start from the template. Rows whose email already exists are skipped, never overwritten. If any row has
            an error, nothing is imported.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="btn btn-primary"
          >
            {pending ? "Importing…" : "Import Users"}
          </button>
          <a
            href={TEMPLATE_HREF}
            className="btn btn-secondary"
          >
            Download Template
          </a>
          <Link href="/admin/users" className="text-sm text-gs-gray hover:underline">
            Back to users
          </Link>
        </div>
      </form>

      {state?.fatal && (
        <p role="alert" className="rounded-md border border-gs-red/40 bg-gs-red/5 p-4 text-sm text-gs-red">
          {state.fatal}
        </p>
      )}

      {state?.rowErrors && (
        <div role="alert" className="rounded-lg border border-gs-red/40 bg-white">
          <p className="border-b border-gs-red/20 p-4 text-sm font-medium text-gs-red">
            {state.rowErrors.length} row{state.rowErrors.length === 1 ? "" : "s"} need fixing. Nothing was imported.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                <tr>
                  <th className="px-4 py-2">Row</th>
                  <th className="px-4 py-2">Email</th>
                  <th className="px-4 py-2">Problem</th>
                </tr>
              </thead>
              <tbody>
                {state.rowErrors.map((e) => (
                  <tr key={e.row} className="border-t border-gs-gray/10">
                    <td className="whitespace-nowrap px-4 py-2">{e.row}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-gs-gray">{e.email || "—"}</td>
                    <td className="px-4 py-2">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {state?.created !== undefined && (
        <div role="status" className="rounded-lg border border-gs-gray/15 bg-white p-4 text-sm">
          <p className="font-medium">
            {state.created} user{state.created === 1 ? "" : "s"} created
            {state.skipped && state.skipped.length > 0 ? `, ${state.skipped.length} skipped (email already exists)` : ""}.
          </p>
          {state.credentials && state.credentials.length > 0 && (
            <div className="mt-4">
              <p className="text-gs-gray">
                These passwords were generated and are shown only now. Share each with its user directly.
              </p>
              <div className="mt-3 overflow-x-auto rounded-md border border-gs-gray/15">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                    <tr>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Email</th>
                      <th className="px-4 py-2">Password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.credentials.map((c) => (
                      <tr key={c.email} className="border-t border-gs-gray/10">
                        <td className="whitespace-nowrap px-4 py-2">{c.name}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-gs-gray">{c.email}</td>
                        <td className="whitespace-nowrap px-4 py-2 font-mono">{c.password}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={() => downloadCredentials(state.credentials ?? [])}
                className="btn btn-secondary mt-3"
              >
                Download passwords (.csv)
              </button>
            </div>
          )}
          <Link href="/admin/users" className="mt-4 inline-block text-gs-red hover:underline">
            View users
          </Link>
        </div>
      )}
    </div>
  );
}
