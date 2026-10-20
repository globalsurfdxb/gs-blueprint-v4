// The header every inner page opens with: a bold title, a muted description, actions on the right
// and a hairline divider. Deliberately light — the dark gradient hero is reserved for the dashboard.

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small label above the title (e.g. the parent section or group). */
  eyebrow?: React.ReactNode;
  /** Buttons / links on the right. */
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-gs-gray/15 pb-5">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-gs-red">{eyebrow}</p>}
        <h1 className="mt-0.5 font-heading text-2xl font-semibold tracking-tight text-gs-black md:text-[28px] md:leading-9">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-gs-gray">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{actions}</div>}
    </header>
  );
}
