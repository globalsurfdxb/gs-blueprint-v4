"use client";

import { useState } from "react";
import Link from "next/link";
import type { TimeLogParams, TimeLogPeriod } from "@/lib/reports";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { Select } from "@/components/select";

const PERIODS: { value: TimeLogPeriod; label: string }[] = [
  { value: "day", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
];

type Option = { id: string; name: string };
type ProjectOption = Option & { clientId: string; clientName: string };

const labelClass = "text-[11px] font-semibold uppercase tracking-wider text-gs-gray";

export function TimeLogsFilters({
  clients,
  projects,
  assignees,
  params,
}: {
  clients: Option[];
  projects: ProjectOption[];
  assignees: Option[];
  params: TimeLogParams;
}) {
  const [period, setPeriod] = useState<TimeLogPeriod>(params.period);
  const anyFilter = !!(params.clientId || params.projectId || params.assigneeId || params.period !== "month");

  return (
    <AutoFilterForm className="mt-6 overflow-hidden rounded-xl border border-gs-gray/10 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm font-medium text-gs-black/80">Filter the report</p>
        {anyFilter && (
          <Link href="/reports/time-logs" className="text-sm font-medium text-gs-red hover:underline">
            Clear filters
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-3 gap-y-3 border-t border-gs-gray/10 bg-gs-light/40 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelClass}>Client</span>
          <Select name="clientId" defaultValue={params.clientId} className="field field-sm w-full">
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelClass}>Project</span>
          <Select name="projectId" defaultValue={params.projectId} className="field field-sm w-full">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.clientName}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelClass}>Assignee</span>
          <Select name="assigneeId" defaultValue={params.assigneeId} className="field field-sm w-full">
            <option value="">Everyone</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={labelClass}>Period</span>
          <Select
            name="period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as TimeLogPeriod)}
            className="field field-sm w-full"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
        </label>
        {period === "custom" && (
          <>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={labelClass}>From</span>
              <input type="date" name="from" defaultValue={params.from} className="field field-sm w-full" />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={labelClass}>To</span>
              <input type="date" name="to" defaultValue={params.to} className="field field-sm w-full" />
            </label>
          </>
        )}
      </div>
    </AutoFilterForm>
  );
}
