import Link from "next/link";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { Select } from "@/components/select";

/**
 * Month navigation for the Content Calendar: previous / next arrows, a jump to the current month, and month + year
 * pickers that apply the moment you choose (no "Go" button). Everything is a plain GET on the page's own address, so each
 * month is shareable, and the page refreshes in place without a reload.
 */
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
  const hrefFor = (m: number, y: number) => `?${view ? `view=${view}&` : ""}month=${m}&year=${y}`;
  const prev = month === 1 ? { m: 12, y: year - 1 } : { m: month - 1, y: year };
  const next = month === 12 ? { m: 1, y: year + 1 } : { m: month + 1, y: year };
  const now = new Date();
  const isCurrent = month === now.getMonth() + 1 && year === now.getFullYear();
  // A few years either side of the month on screen; the list re-centres as you move.
  const years = Array.from({ length: 7 }, (_, i) => year - 3 + i);

  const arrow =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-gs-gray/25 bg-white text-gs-gray transition-colors hover:bg-gs-light hover:text-gs-black active:scale-95";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex items-center gap-1.5">
        <Link href={hrefFor(prev.m, prev.y)} aria-label="Previous month" className={arrow}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M12 5l-5 5 5 5" />
          </svg>
        </Link>
        <Link href={hrefFor(next.m, next.y)} aria-label="Next month" className={arrow}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M8 5l5 5-5 5" />
          </svg>
        </Link>
      </div>

      <AutoFilterForm className="flex items-end gap-2 transition-opacity">
        {view && <input type="hidden" name="view" value={view} />}
        <div className="flex flex-col gap-1">
          <label htmlFor="cal-month" className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Month</label>
          <Select id="cal-month" name="month" defaultValue={month} className="field field-sm w-40">
            {monthNames.map((name, i) => (
              <option key={name} value={i + 1}>{name}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="cal-year" className="text-[11px] font-semibold uppercase tracking-wider text-gs-gray">Year</label>
          <Select id="cal-year" name="year" defaultValue={year} className="field field-sm w-28">
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </div>
      </AutoFilterForm>

      {!isCurrent && (
        <Link href={hrefFor(now.getMonth() + 1, now.getFullYear())} className="btn btn-secondary btn-sm">
          This month
        </Link>
      )}
    </div>
  );
}
