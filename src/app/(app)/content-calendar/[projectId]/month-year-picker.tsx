import { Select } from "@/components/select";
export function MonthYearPicker({
  month,
  year,
  monthNames,
  view,
}: {
  month: number;
  year: number;
  monthNames: string[];
  view?: string;
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      {view && <input type="hidden" name="view" value={view} />}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-gs-gray">Month</label>
        <Select
          name="month"
          defaultValue={month}
          className="field"
        >
          {monthNames.map((name, i) => (
            <option key={name} value={i + 1}>{name}</option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-gs-gray">Year</label>
        <input
          name="year"
          type="number"
          defaultValue={year}
          className="field w-24"
        />
      </div>
      <button
        type="submit"
        className="btn btn-secondary"
      >
        Go
      </button>
    </form>
  );
}
