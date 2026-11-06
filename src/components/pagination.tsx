import Link from "next/link";

/** Rows per page on every paginated listing. */
export const PAGE_SIZE = 20;

/** Clamp a ?page= value into range and slice the list for it. */
export function paginate<T>(items: T[], pageParam: string | undefined, pageSize = PAGE_SIZE) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const requested = Number.parseInt(pageParam ?? "", 10);
  const page = Math.min(Math.max(Number.isFinite(requested) ? requested : 1, 1), pages);
  return { page, pages, total, pageSize, slice: items.slice((page - 1) * pageSize, page * pageSize) };
}

/** Same clamping when the query itself is paged (skip/take) and only the total is known. */
export function pageWindow(total: number, pageParam: string | undefined, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requested = Number.parseInt(pageParam ?? "", 10);
  const current = Math.min(Math.max(Number.isFinite(requested) ? requested : 1, 1), totalPages);
  return { page: current, pages: totalPages, total, pageSize, skip: (current - 1) * pageSize };
}

/** 1 … 4 5 [6] 7 8 … 20 — the first, last and neighbouring pages, with gaps collapsed. */
function pageList(page: number, pages: number): (number | "gap")[] {
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  const out: (number | "gap")[] = [];
  let last = 0;
  for (let n = 1; n <= pages; n++) {
    if (!keep.has(n)) continue;
    if (n - last > 1) out.push("gap");
    out.push(n);
    last = n;
  }
  return out;
}

/**
 * Footer for a listing card: "Showing 21–40 of 87" and Previous / page numbers / Next. `hrefFor` builds the link for
 * a page number, so each listing keeps its own filters in the URL. Renders nothing when everything fits on one page.
 */
export function Pagination({
  page,
  pages,
  total,
  pageSize,
  hrefFor,
  noun,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  hrefFor: (page: number) => string;
  noun: string;
}) {
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn =
    "flex h-9 min-w-9 items-center justify-center rounded-md px-2.5 text-sm font-medium transition-colors";
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-gs-gray/10 bg-gs-light/40 px-4 py-3"
    >
      <p className="text-sm text-gs-gray">
        Showing <span className="font-medium text-gs-black">{from}–{to}</span> of{" "}
        <span className="font-medium text-gs-black">{total}</span> {noun}
      </p>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={`${btn} text-gs-gray hover:bg-white hover:text-gs-black`} aria-label="Previous page">
            ← Previous
          </Link>
        ) : (
          <span className={`${btn} cursor-not-allowed text-gs-gray/40`} aria-hidden>
            ← Previous
          </span>
        )}
        {pageList(page, pages).map((n, i) =>
          n === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-gs-gray/60" aria-hidden>
              …
            </span>
          ) : n === page ? (
            <span key={n} aria-current="page" className={`${btn} bg-gs-black text-white`}>
              {n}
            </span>
          ) : (
            <Link key={n} href={hrefFor(n)} className={`${btn} text-gs-gray hover:bg-white hover:text-gs-black`} aria-label={`Page ${n}`}>
              {n}
            </Link>
          ),
        )}
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={`${btn} text-gs-gray hover:bg-white hover:text-gs-black`} aria-label="Next page">
            Next →
          </Link>
        ) : (
          <span className={`${btn} cursor-not-allowed text-gs-gray/40`} aria-hidden>
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
