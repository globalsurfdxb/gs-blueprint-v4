import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canSearch } from "@/lib/permissions";
import { getSearchFilterOptions, runSearch, SORT_OPTIONS, type SearchParams } from "@/lib/search";
import { statusLabel, SEVERITY_LABELS, SEVERITY_VALUES } from "@/lib/bug";
import { PageHeader } from "@/components/page-header";
import { Select } from "@/components/select";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "REVIEW", label: "Review" },
  { value: "REVISION", label: "Revision" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ON_HOLD", label: "On Hold" },
];

function str(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSearch(user)) redirect("/");

  const sp = await searchParams;
  const params: SearchParams = {
    q: str(sp.q),
    clientId: str(sp.clientId),
    projectId: str(sp.projectId),
    status: str(sp.status),
    assignedToId: str(sp.assignedToId),
    dueFrom: str(sp.dueFrom),
    dueTo: str(sp.dueTo),
    timer: str(sp.timer),
    sort: str(sp.sort) || "due",
    taskType: str(sp.taskType),
    severity: str(sp.severity),
    sprint: str(sp.sprint),
  };

  const hasQuery = Boolean(
    params.q || params.clientId || params.projectId || params.status || params.assignedToId || params.dueFrom || params.dueTo || params.timer || params.taskType || params.sprint,
  );

  const options = await getSearchFilterOptions(user);
  const results = hasQuery ? await runSearch(user, params) : [];

  const fieldClass =
    "field";

  return (
    <div>
      <PageHeader
        title="Search"
        description={<>Search project and task names, then narrow with filters.</>}
      />

      <form method="get" className="mt-6 rounded-lg border border-gs-gray/15 bg-white p-4">
        <div className="flex flex-col gap-3">
          <input
            type="search"
            name="q"
            aria-label="Search project or task name"
            defaultValue={params.q}
            placeholder="Search project or task name…"
            className={fieldClass}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-gs-gray">Client</span>
              <Select name="clientId" defaultValue={params.clientId} className={fieldClass}>
                <option value="">All clients</option>
                {options.clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-gs-gray">Project</span>
              <Select name="projectId" defaultValue={params.projectId} className={fieldClass}>
                <option value="">All projects</option>
                {options.projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-gs-gray">Assigned To</span>
              <Select name="assignedToId" defaultValue={params.assignedToId} className={fieldClass}>
                <option value="">Anyone</option>
                {options.assignees.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-gs-gray">Status</span>
              <Select name="status" defaultValue={params.status} className={fieldClass}>
                <option value="">Any status</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-gs-gray">Due From</span>
              <input type="date" name="dueFrom" defaultValue={params.dueFrom} className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-gs-gray">Due To</span>
              <input type="date" name="dueTo" defaultValue={params.dueTo} className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-gs-gray">Timer Status</span>
              <Select name="timer" defaultValue={params.timer} className={fieldClass}>
                <option value="">Any</option>
                <option value="running">Running</option>
                <option value="notrunning">Not Running</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-gs-gray">Task Type</span>
              <Select name="taskType" defaultValue={params.taskType} className={fieldClass}>
                <option value="">Any</option>
                <option value="STANDARD">Standard</option>
                <option value="BUG">Bug</option>
              </Select>
            </label>
            {params.taskType === "BUG" && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gs-gray">Severity</span>
                <Select name="severity" defaultValue={params.severity} className={fieldClass}>
                  <option value="">Any severity</option>
                  {SEVERITY_VALUES.map((s) => (
                    <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
                  ))}
                </Select>
              </label>
            )}
            {options.sprintWorkflowInScope && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gs-gray">Sprint</span>
                <Select name="sprint" defaultValue={params.sprint} className={fieldClass}>
                  <option value="">Any</option>
                  <option value="active">Active Sprint</option>
                  <option value="backlog">Backlog</option>
                  {options.sprints.length > 0 && (
                    <optgroup label="Specific Sprint">
                      {options.sprints.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-gs-gray">Sort By</span>
              <Select name="sort" defaultValue={params.sort} className={fieldClass}>
                {SORT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="btn btn-primary"
            >
              Search
            </button>
            <Link
              href="/search"
              className="btn btn-secondary"
            >
              Clear
            </Link>
          </div>
        </div>
      </form>

      {hasQuery && (
        <div className="mt-6">
          <p className="text-sm text-gs-gray">
            {results.length === 0
              ? "No matching tasks."
              : `${results.length} result${results.length === 1 ? "" : "s"}${results.length === 200 ? " (showing first 200)" : ""}`}
          </p>
          {results.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-lg border border-gs-gray/15 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b border-gs-gray/10 bg-gs-light/60 text-left text-[11px] font-semibold uppercase tracking-wider text-gs-gray">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-2">Task</th>
                      <th className="whitespace-nowrap px-4 py-2">Project</th>
                      <th className="whitespace-nowrap px-4 py-2">Client</th>
                      <th className="whitespace-nowrap px-4 py-2">Assignee</th>
                      <th className="whitespace-nowrap px-4 py-2">Status</th>
                      <th className="whitespace-nowrap px-4 py-2">Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((t) => (
                      <tr key={t.id} className="border-t border-gs-gray/10">
                        <td className="px-4 py-2">
                          {t.taskType === "BUG" && (
                            <span className="mr-1.5 rounded-full bg-gs-red/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gs-red">
                              Bug{t.severity ? ` · ${SEVERITY_LABELS[t.severity]}` : ""}
                            </span>
                          )}
                          <Link href={`/projects/${t.projectId}/tasks/${t.id}`} className="font-medium hover:underline">
                            {t.parentName ? `${t.parentName} › ${t.name}` : t.name}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-gs-gray">{t.projectName}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-gs-gray">{t.clientName}</td>
                        <td className="whitespace-nowrap px-4 py-2">
                          {t.assigneeName ? (
                            <span className="text-gs-gray">{t.assigneeName}</span>
                          ) : (
                            <span className="font-medium text-gs-red">Not Assigned</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-gs-gray">{statusLabel(t.status, t.taskType)}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-gs-gray">{t.dueDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
