// A small coloured pill for a project's status. One definition so the list, the detail header and
// any future surface agree on colours and labels. Colour is never the only signal: the label is
// always printed, and a dot echoes the tone.

const PROJECT_STATUS: Record<string, { label: string; chip: string; dot: string }> = {
  PLANNING: { label: "Planning", chip: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  ACTIVE: { label: "Active", chip: "bg-green-50 text-green-700", dot: "bg-green-500" },
  PAUSED: { label: "Paused", chip: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  COMPLETED: { label: "Completed", chip: "bg-gs-light text-gs-black", dot: "bg-gs-black" },
  CANCELLED: { label: "Cancelled", chip: "bg-gs-red/10 text-gs-red", dot: "bg-gs-red" },
};

export function projectStatusLabel(status: string): string {
  return PROJECT_STATUS[status]?.label ?? status;
}

export function ProjectStatusChip({ status }: { status: string }) {
  const s = PROJECT_STATUS[status] ?? { label: status, chip: "bg-gs-light text-gs-gray", dot: "bg-gs-gray" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.chip}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
