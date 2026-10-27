import Link from "next/link";

// Shared building blocks for every dashboard (Admin / Cluster Head, Lead, Dependency Tracker) so
// they all read as one product: hero banner, icon KPI tiles, section cards and empty states.

// Stroke icons for the KPI tiles (24px grid). Decorative — the label carries the meaning.
export const TILE_ICONS = {
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5M12 16h.01" />
    </>
  ),
  revision: (
    <>
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 21v-5h5M3 12A9 9 0 0 1 18.5 5.8L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  hourglass: <path d="M6 3h12M6 21h12M7 3v4l5 5-5 5v4M17 3v4l-5 5 5 5v4" />,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2M9 2h6" />
    </>
  ),
} as const;

export type TileIcon = keyof typeof TILE_ICONS;

export function StatCard({
  label,
  value,
  tone = "default",
  href,
  icon,
  attention,
}: {
  label: string;
  value: number;
  tone?: "default" | "warn" | "danger";
  href?: string;
  icon?: TileIcon;
  /** Shows a short status caption under the number — for the "needs attention" tiles. */
  attention?: boolean;
}) {
  const valueColor = tone === "danger" ? "text-gs-red" : tone === "warn" ? "text-amber-600" : "text-gs-black";
  // Tone shows up as a soft tinted icon chip, a faint border and a caption — only when the number
  // needs attention, so a calm dashboard stays calm.
  const chip =
    tone === "danger"
      ? "bg-gs-red/10 text-gs-red"
      : tone === "warn"
        ? "bg-amber-100 text-amber-600"
        : "bg-gs-light text-gs-gray";
  const edge = tone === "danger" ? "border-gs-red/25" : tone === "warn" ? "border-amber-300/50" : "border-gs-gray/10";
  const caption =
    tone === "danger" ? "Needs action" : tone === "warn" ? "Keep an eye on it" : attention ? "All clear" : null;
  const captionColor = tone === "danger" ? "text-gs-red" : tone === "warn" ? "text-amber-600" : "text-green-600";
  const dot = tone === "danger" ? "bg-gs-red" : tone === "warn" ? "bg-amber-500" : "bg-green-500";
  const body = (
    <>
      <div className="relative flex items-start justify-between gap-2">
        <p className="pt-0.5 text-[13px] font-medium leading-snug text-gs-gray">{label}</p>
        {icon && (
          <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${chip}`}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px]"
            >
              {TILE_ICONS[icon]}
            </svg>
          </span>
        )}
      </div>
      <p className={`relative mt-4 font-heading text-4xl font-bold tracking-tight tabular-nums ${valueColor}`}>{value}</p>
      {/* Always reserve the caption line so every tile is the same height, captioned or not. */}
      <p className={`relative mt-1.5 flex h-4 items-center gap-1.5 text-xs font-medium ${captionColor}`}>
        {caption && (
          <>
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            {caption}
          </>
        )}
      </p>
    </>
  );
  const cls = `relative block h-full overflow-hidden rounded-2xl border bg-white p-5 shadow-sm ${edge}`;
  return href ? (
    <Link href={href} className={`${cls} transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-gs-black/5`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function SectionCard({
  id,
  title,
  count,
  className = "",
  children,
}: {
  /** Anchor id, so a tile or pill elsewhere on the page can link here ("#overdue-tasks"). */
  id?: string;
  title: string;
  /** Item count badge beside the title; red when > 0 so a non-empty problem list stands out. */
  count?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 overflow-hidden rounded-2xl border border-gs-gray/10 bg-white shadow-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-gs-light/50 ${className}`}
    >
      <h2 className="flex items-center gap-2.5 border-b border-gs-gray/10 px-5 py-4 font-heading text-base font-semibold tracking-tight">
        {title}
        {count !== undefined && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
              count > 0 ? "bg-gs-red/10 text-gs-red" : "bg-gs-light text-gs-gray"
            }`}
          >
            {count}
          </span>
        )}
      </h2>
      {/* Long lists scroll inside the card instead of stretching the page; the table header stays pinned.
          The wrapper owns both scroll axes, so the tables' own horizontal scroller steps aside. */}
      <div className="max-h-[26rem] overflow-auto [&_.overflow-x-auto]:overflow-visible [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-gs-light">
        {children}
      </div>
    </section>
  );
}

/** A project's name with its client underneath — for a "Project" table cell. */
export function ProjectLabel({ name, client }: { name: string; client: string }) {
  return (
    <>
      <span className="block font-medium text-gs-black/80">{name}</span>
      <span className="block text-xs text-gs-gray">{client}</span>
    </>
  );
}

/** Friendly empty state for a widget with nothing to show. */
export function EmptyState({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 px-4 py-5 text-sm text-gs-gray">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="h-4 w-4 shrink-0 text-green-600"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12l3 3 5-6" />
      </svg>
      {text}
    </p>
  );
}

/** Time-of-day greeting in the viewer's own timezone (Dubai or India), plus a long date. */
export function greetingFor(location: string): { greeting: string; dateLabel: string } {
  const timeZone = location === "INDIA" ? "Asia/Kolkata" : "Asia/Dubai";
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone }).format(now)) % 24;
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(now);
  return { greeting, dateLabel };
}

/** A status pill for the hero banner: red = needs action, amber = watch, green = all clear. */
export function HeroPill({
  tone,
  href,
  children,
}: {
  tone: "danger" | "warn" | "ok" | "neutral";
  /** Makes the pill a link (e.g. to the list of overdue tasks it counts). */
  href?: string;
  children: React.ReactNode;
}) {
  const style =
    tone === "danger"
      ? { wrap: "bg-gs-red/20 ring-gs-red/40", dot: "bg-gs-red" }
      : tone === "warn"
        ? { wrap: "bg-amber-400/15 ring-amber-300/30", dot: "bg-amber-400" }
        : tone === "ok"
          ? { wrap: "bg-white/10 ring-white/15", dot: "bg-green-400" }
          : { wrap: "bg-white/10 ring-white/15", dot: "bg-white/60" };
  const cls = `inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ring-1 ${style.wrap}`;
  const inner = (
    <>
      <span aria-hidden className={`h-2 w-2 rounded-full ${style.dot}`} />
      {children}
      {href && <span aria-hidden>›</span>}
    </>
  );
  return href ? (
    <Link href={href} className={`${cls} transition hover:bg-white/20`}>
      {inner}
    </Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

/**
 * The dark gradient greeting banner at the top of every dashboard: date, "Good morning, <name>",
 * a row of status pills, the scope label and one call-to-action link.
 */
export function DashboardHero({
  location,
  name,
  pills,
  scopeLabel,
  action,
}: {
  location: string;
  name: string;
  pills: React.ReactNode;
  scopeLabel: string;
  action: { href: string; label: string };
}) {
  const { greeting, dateLabel } = greetingFor(location);
  const firstName = name.split(" ")[0];
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1d1e24] via-[#23252c] to-[#2e1c1f] p-6 text-white shadow-lg md:p-8">
      {/* Brand glow + faint grid — decorative only. */}
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-gs-red/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/3 h-72 w-72 rounded-full bg-[#ff7a59]/10 blur-3xl" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:36px_36px] [mask-image:linear-gradient(to_bottom_right,black,transparent_70%)]"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
        <div>
          <p className="text-sm font-medium text-white/60">{dateLabel}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">
            {greeting}, {firstName}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">{pills}</div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 ring-1 ring-white/15">
            {scopeLabel}
          </span>
          <Link href={action.href} className="btn bg-white text-gs-black shadow-sm hover:bg-white/90">
            {action.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
