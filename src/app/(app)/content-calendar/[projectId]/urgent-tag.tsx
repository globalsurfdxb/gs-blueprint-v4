/** Lightning-bolt mark used wherever an urgent calendar task is flagged. Decorative; the "Urgent" text carries the meaning. */
export function UrgentIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={className}>
      <path d="M11.3 1.5 3.6 11.2a.6.6 0 0 0 .47.97H8l-.9 6a.4.4 0 0 0 .72.3l7.7-9.7a.6.6 0 0 0-.47-.97H11.2l.9-5.9a.4.4 0 0 0-.8-.4Z" />
    </svg>
  );
}

/** The mark shown on an urgent task in the Content Calendar: just the bolt in a red dot (the row's tint does the rest). */
export function UrgentTag() {
  return (
    <span
      title="Urgent task"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gs-red text-white"
    >
      <UrgentIcon className="h-3 w-3" />
      <span className="sr-only">Urgent</span>
    </span>
  );
}
